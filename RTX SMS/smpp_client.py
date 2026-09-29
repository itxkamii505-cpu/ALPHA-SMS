"""
Real SMPP v3.4 client (ESME) — pure Python, no third-party library.

This app acts as the ESME (client) and binds outbound, in transceiver mode,
to the carrier's SMSC using the host/port/system_id/password configured on
each "SMPP Account". Once bound, the carrier pushes deliver_sm PDUs to us
over that same connection — each one is an incoming SMS/OTP, which we log
through the exact same ingest_sms() pipeline the HTTP interconnect uses.

Implements just what's needed to receive reliably:
  - bind_transceiver / bind_transceiver_resp
  - enquire_link / enquire_link_resp   (keepalive, both directions)
  - deliver_sm / deliver_sm_resp       (the actual incoming messages)
  - unbind / unbind_resp
  - generic_nack                       (sent back for anything we can't parse,
                                         instead of silently dropping it)

Every connection auto-reconnects with backoff on any disconnect or error,
so a network blip never permanently stops OTPs from coming in.
"""

import asyncio
import struct
import logging
import base64
from datetime import datetime

logger = logging.getLogger("smpp_client")


def _decode_password(stored: str) -> str:
    """The admin UI stores the password base64-encoded (so it's never shown
    in plaintext in the accounts list/API response). Decode it back to the
    real value the carrier actually expects for bind_transceiver."""
    if not stored:
        return ""
    try:
        return base64.b64decode(stored).decode("utf-8", errors="replace")
    except Exception:
        return stored  # already-plain password (e.g. entered directly via API)

# ─── SMPP v3.4 command IDs ───────────────────────────────────────────────────
CMD_BIND_RECEIVER         = 0x00000001
CMD_BIND_RECEIVER_RESP    = 0x80000001
CMD_BIND_TRANSMITTER      = 0x00000002
CMD_BIND_TRANSMITTER_RESP = 0x80000002
CMD_BIND_TRANSCEIVER      = 0x00000009
CMD_BIND_TRANSCEIVER_RESP = 0x80000009
CMD_ENQUIRE_LINK          = 0x00000015
CMD_ENQUIRE_LINK_RESP     = 0x80000015
CMD_DELIVER_SM            = 0x00000005
CMD_DELIVER_SM_RESP       = 0x80000005
CMD_UNBIND                = 0x00000006
CMD_UNBIND_RESP           = 0x80000006
CMD_GENERIC_NACK          = 0x80000000
CMD_SUBMIT_SM             = 0x00000004
CMD_SUBMIT_SM_RESP        = 0x80000004

STATUS_OK = 0x00000000
STATUS_INVALID_SYSID  = 0x0000000F
STATUS_INVALID_PASWD  = 0x0000000E
STATUS_ALREADY_BOUND  = 0x00000005


def _cstr(s: str) -> bytes:
    """C-octet string: value + null terminator."""
    return (s or "").encode("ascii", errors="replace") + b"\x00"


def _read_cstr(buf: bytes, offset: int):
    """Read a null-terminated string starting at offset. Returns (value, new_offset)."""
    end = buf.find(b"\x00", offset)
    if end == -1:
        return "", len(buf)
    return buf[offset:end].decode("ascii", errors="replace"), end + 1


def encode_pdu(command_id: int, command_status: int, sequence_number: int, body: bytes = b"") -> bytes:
    header = struct.pack(">IIII", 16 + len(body), command_id, command_status, sequence_number)
    return header + body


def decode_header(data: bytes):
    command_length, command_id, command_status, sequence_number = struct.unpack(">IIII", data[:16])
    return command_length, command_id, command_status, sequence_number


def build_bind_transceiver(system_id: str, password: str, sequence_number: int) -> bytes:
    body = (
        _cstr(system_id) +
        _cstr(password) +
        _cstr("")            # system_type
        + bytes([0x34])       # interface_version — SMPP v3.4
        + bytes([0x00])       # addr_ton
        + bytes([0x00])       # addr_npi
        + _cstr("")           # address_range
    )
    return encode_pdu(CMD_BIND_TRANSCEIVER, STATUS_OK, sequence_number, body)


def build_enquire_link(sequence_number: int) -> bytes:
    return encode_pdu(CMD_ENQUIRE_LINK, STATUS_OK, sequence_number, b"")


def build_enquire_link_resp(sequence_number: int) -> bytes:
    return encode_pdu(CMD_ENQUIRE_LINK_RESP, STATUS_OK, sequence_number, b"")


def build_bind_resp(command_id: int, status: int, sequence_number: int, system_id: str = "") -> bytes:
    """Generic bind_*_resp builder — command_id must be the matching *_RESP
    id for whichever bind type the client requested (TRX/TX/RX)."""
    return encode_pdu(command_id, status, sequence_number, _cstr(system_id))


def build_submit_sm_resp(sequence_number: int, message_id: str = "") -> bytes:
    return encode_pdu(CMD_SUBMIT_SM_RESP, STATUS_OK, sequence_number, _cstr(message_id))


def build_deliver_sm_resp(sequence_number: int, message_id: str = "") -> bytes:
    return encode_pdu(CMD_DELIVER_SM_RESP, STATUS_OK, sequence_number, _cstr(message_id))


def build_unbind(sequence_number: int) -> bytes:
    return encode_pdu(CMD_UNBIND, STATUS_OK, sequence_number, b"")


def build_generic_nack(sequence_number: int, status: int = 0x00000003) -> bytes:
    return encode_pdu(CMD_GENERIC_NACK, status, sequence_number, b"")


def parse_deliver_sm(body: bytes) -> dict:
    """Parse just the fields we actually need: source_addr (CLI/from),
    destination_addr (the number the SMS was sent to), and short_message
    (the OTP/message body). Anything after short_message (optional TLVs)
    is ignored — not needed for basic MO/MT forwarding."""
    offset = 0
    service_type, offset = _read_cstr(body, offset)
    offset += 2  # source_addr_ton, source_addr_npi (1 byte each)
    source_addr, offset = _read_cstr(body, offset)
    offset += 2  # dest_addr_ton, dest_addr_npi
    destination_addr, offset = _read_cstr(body, offset)
    offset += 1  # esm_class
    offset += 1  # protocol_id
    offset += 1  # priority_flag
    _, offset = _read_cstr(body, offset)  # schedule_delivery_time
    _, offset = _read_cstr(body, offset)  # validity_period
    offset += 1  # registered_delivery
    offset += 1  # replace_if_present_flag
    offset += 1  # data_coding
    offset += 1  # sm_default_msg_id
    sm_length = body[offset] if offset < len(body) else 0
    offset += 1
    short_message = body[offset:offset + sm_length].decode("utf-8", errors="replace") if sm_length else ""
    return {"from": source_addr, "to": destination_addr, "message": short_message}

# submit_sm has the exact same body layout as deliver_sm in SMPP v3.4
parse_sm_pdu = parse_deliver_sm


class SmppConnection:
    """One persistent bind to one carrier account. Auto-reconnects forever
    with capped exponential backoff until explicitly stopped."""

    def __init__(self, account: dict, on_message, on_status_change):
        self.account = account
        self.on_message = on_message              # async fn(from, to, message, sms_id, company)
        self.on_status_change = on_status_change   # async fn(account_id, status)
        self._stop = False
        self._seq = 0
        self._reader = None
        self._writer = None
        self._task = None
        self._write_lock = asyncio.Lock()
        self._last_activity = None

    def next_seq(self) -> int:
        self._seq += 1
        if self._seq > 0x7FFFFFFF:
            self._seq = 1
        return self._seq

    def start(self):
        self._task = asyncio.create_task(self._run_forever())
        return self._task

    async def _send(self, pdu: bytes):
        """All writes go through here, serialized by a lock, so the keepalive
        loop and the message-response loop can never interleave bytes on the
        wire — that byte-level collision was silently corrupting the PDU
        stream and causing the carrier to drop the connection."""
        async with self._write_lock:
            self._writer.write(pdu)
            await self._writer.drain()

    async def stop(self):
        self._stop = True
        if self._writer:
            try:
                await self._send(build_unbind(self.next_seq()))
            except Exception:
                pass
            try:
                self._writer.close()
            except Exception:
                pass
        if self._task:
            self._task.cancel()

    async def _run_forever(self):
        backoff = 3
        while not self._stop:
            try:
                await self._connect_and_bind()
                await self._read_loop()
                backoff = 3  # reset after a clean session
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.warning(f"SMPP [{self.account.get('company')}] connection error: {e}")
                await self.on_status_change(self.account["id"], "error")
            if self._stop:
                break
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 60)

    async def _connect_and_bind(self):
        host = self.account["host"]
        port = int(self.account["port"])
        system_id = self.account.get("system_id", "")
        password = _decode_password(self.account.get("password", ""))

        self._reader, self._writer = await asyncio.wait_for(
            asyncio.open_connection(host, port), timeout=15
        )

        pdu = build_bind_transceiver(system_id, password, self.next_seq())
        await self._send(pdu)

        header_bytes = await asyncio.wait_for(self._reader.readexactly(16), timeout=15)
        command_length, command_id, command_status, sequence_number = decode_header(header_bytes)
        remaining = await self._reader.readexactly(command_length - 16) if command_length > 16 else b""

        if command_id != CMD_BIND_TRANSCEIVER_RESP or command_status != STATUS_OK:
            raise ConnectionError(f"Bind rejected (status={command_status})")

        await self.on_status_change(self.account["id"], "active")
        logger.info(f"SMPP [{self.account.get('company')}] bound to {host}:{port}")

        self._keepalive_task = asyncio.create_task(self._keepalive_loop())

    async def _keepalive_loop(self):
        try:
            while not self._stop and self._writer and not self._writer.is_closing():
                await asyncio.sleep(30)
                await self._send(build_enquire_link(self.next_seq()))
        except Exception:
            pass

    async def _read_loop(self):
        try:
            while not self._stop:
                header_bytes = await asyncio.wait_for(self._reader.readexactly(16), timeout=90)
                command_length, command_id, command_status, sequence_number = decode_header(header_bytes)
                body = await self._reader.readexactly(command_length - 16) if command_length > 16 else b""

                if command_id == CMD_DELIVER_SM:
                    try:
                        msg = parse_deliver_sm(body)
                        sms_id = f"smpp-{self.account['id']}-{sequence_number}-{int(datetime.utcnow().timestamp())}"
                        await self.on_message(
                            msg["from"], msg["to"], msg["message"], sms_id,
                            self.account.get("company", self.account.get("system_id", ""))
                        )
                        await self._send(build_deliver_sm_resp(sequence_number))
                    except Exception as e:
                        logger.warning(f"SMPP deliver_sm parse error: {e}")
                        await self._send(build_generic_nack(sequence_number))

                elif command_id == CMD_ENQUIRE_LINK:
                    await self._send(build_enquire_link_resp(sequence_number))

                elif command_id == CMD_ENQUIRE_LINK_RESP:
                    pass  # keepalive ack, nothing to do

                elif command_id == CMD_UNBIND:
                    await self._send(encode_pdu(CMD_UNBIND_RESP, STATUS_OK, sequence_number, b""))
                    raise ConnectionError("Carrier requested unbind")

                else:
                    # Unknown/unhandled PDU — don't silently drop it, nack it
                    await self._send(build_generic_nack(sequence_number))
        finally:
            await self.on_status_change(self.account["id"], "disconnected")
            if hasattr(self, "_keepalive_task"):
                self._keepalive_task.cancel()
            if self._writer:
                try:
                    self._writer.close()
                except Exception:
                    pass


class SmppServer:
    """The MAIT SMS panel acts as the SMSC (server) here — carriers connect
    OUTBOUND to us using the host/port/system_id/password they were given
    (shown on the carrier's own SMPP client config screen), and we accept
    the bind, then receive their messages as submit_sm or deliver_sm PDUs.

    One TCP listener handles every carrier: each connecting client's bind
    credentials (system_id + password) are matched against the stored SMPP
    Accounts to figure out which carrier just connected, so each company's
    OTP volume is still tracked separately."""

    def __init__(self, on_message, on_status_change, get_accounts_fn, max_connections: int = 100):
        self.on_message = on_message                # async fn(from, to, message, sms_id, company)
        self.on_status_change = on_status_change     # async fn(account_id, status)
        self.get_accounts_fn = get_accounts_fn       # sync fn() -> list of smpp_accounts dicts
        self.max_connections = max_connections
        self._server = None
        self._connections = {}  # account_id -> writer (the CURRENTLY live connection for that account)

    async def start(self, host: str, port: int):
        if self._server:
            return  # already running
        self._server = await asyncio.start_server(self._handle_client, host, port)
        addr = ", ".join(str(sock.getsockname()) for sock in self._server.sockets)
        logger.info(f"SMPP server listening on {addr}")

    async def stop(self):
        if self._server:
            self._server.close()
            await self._server.wait_closed()
            self._server = None

    def _find_account(self, system_id: str, password: str):
        system_id = (system_id or "").strip()
        password = (password or "").strip()
        for acc in self.get_accounts_fn():
            if acc.get("interconnect_type") not in (None, "smpp", "smpp-server"):
                continue
            acc_sid = (acc.get("system_id") or "").strip()
            acc_pass = _decode_password(acc.get("password", "")).strip()
            if acc_sid == system_id and acc_pass == password:
                return acc
        return None

    async def _handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        peer = writer.get_extra_info("peername")
        peer_ip = peer[0] if peer else "unknown"
        write_lock = asyncio.Lock()
        account = None
        bound = False
        keepalive_task = None

        if len(self._connections) >= self.max_connections:
            logger.warning(f"SMPP server: rejecting {peer_ip} — max connections ({self.max_connections}) reached")
            writer.close()
            return

        async def send(pdu: bytes):
            async with write_lock:
                writer.write(pdu)
                await writer.drain()

        async def keepalive_loop():
            """We send our own periodic enquire_link too (not just respond to
            theirs) — belt-and-braces against NAT/firewall connection-tracking
            silently dropping a TCP session that looks idle from the outside."""
            seq = 900000
            try:
                while not writer.is_closing():
                    await asyncio.sleep(30)
                    seq += 1
                    await send(build_enquire_link(seq))
            except Exception:
                pass

        try:
            logger.info(f"SMPP server: incoming connection from {peer_ip}")
            while True:
                header_bytes = await asyncio.wait_for(reader.readexactly(16), timeout=120)
                command_length, command_id, command_status, sequence_number = decode_header(header_bytes)
                body = await reader.readexactly(command_length - 16) if command_length > 16 else b""

                if command_id in (CMD_BIND_TRANSCEIVER, CMD_BIND_TRANSMITTER, CMD_BIND_RECEIVER):
                    offset = 0
                    system_id, offset = _read_cstr(body, offset)
                    password, offset = _read_cstr(body, offset)
                    resp_id = {
                        CMD_BIND_TRANSCEIVER: CMD_BIND_TRANSCEIVER_RESP,
                        CMD_BIND_TRANSMITTER: CMD_BIND_TRANSMITTER_RESP,
                        CMD_BIND_RECEIVER: CMD_BIND_RECEIVER_RESP,
                    }[command_id]

                    found = self._find_account(system_id, password)
                    if not found:
                        logger.warning(f"SMPP server: rejected bind from {peer_ip} — no account matches system_id='{system_id}'")
                        await send(build_bind_resp(resp_id, STATUS_INVALID_SYSID, sequence_number))
                        writer.close()
                        return

                    account = found
                    bound = True
                    self._connections[account["id"]] = writer
                    await send(build_bind_resp(resp_id, STATUS_OK, sequence_number, system_id))
                    await self.on_status_change(account["id"], "active")
                    logger.info(f"SMPP server: '{account.get('company')}' (system_id={system_id}) bound from {peer_ip}")
                    keepalive_task = asyncio.create_task(keepalive_loop())

                elif command_id in (CMD_SUBMIT_SM, CMD_DELIVER_SM):
                    resp_builder = build_submit_sm_resp if command_id == CMD_SUBMIT_SM else build_deliver_sm_resp
                    if not bound:
                        logger.warning(f"SMPP server: message PDU from {peer_ip} before bind — rejecting")
                        await send(build_generic_nack(sequence_number, STATUS_INVALID_SYSID))
                        continue
                    try:
                        msg = parse_sm_pdu(body)
                        sms_id = f"smpp-{account['id']}-{sequence_number}-{int(datetime.utcnow().timestamp())}"
                        logger.info(f"SMPP server: message received from '{account.get('company')}' → {msg['to']}")
                        await self.on_message(
                            msg["from"], msg["to"], msg["message"], sms_id,
                            account.get("company", account.get("system_id", ""))
                        )
                        await send(resp_builder(sequence_number, f"MSG{sequence_number}"))
                    except Exception as e:
                        logger.warning(f"SMPP server: failed to parse message PDU from {peer_ip}: {e}")
                        await send(build_generic_nack(sequence_number))

                elif command_id == CMD_ENQUIRE_LINK:
                    await send(build_enquire_link_resp(sequence_number))

                elif command_id == CMD_ENQUIRE_LINK_RESP:
                    pass

                elif command_id == CMD_UNBIND:
                    await send(encode_pdu(CMD_UNBIND_RESP, STATUS_OK, sequence_number, b""))
                    logger.info(f"SMPP server: '{account.get('company') if account else peer_ip}' sent unbind")
                    break

                else:
                    logger.warning(f"SMPP server: unhandled command_id={hex(command_id)} from {peer_ip}")
                    await send(build_generic_nack(sequence_number))

        except asyncio.TimeoutError:
            logger.warning(f"SMPP server: connection from {peer_ip}"
                           f"{' (' + account.get('company','') + ')' if account else ''} timed out (no activity for 120s)")
        except (asyncio.IncompleteReadError, ConnectionResetError, BrokenPipeError):
            pass  # normal disconnects — nothing to log as an error
        except Exception as e:
            logger.warning(f"SMPP server connection error ({peer_ip}): {e}")
        finally:
            if keepalive_task:
                keepalive_task.cancel()
            if account:
                # Only clear/mark-disconnected if THIS connection is still the
                # one on record — otherwise a stale disconnect could wrongly
                # wipe out a newer, already-reconnected live session.
                if self._connections.get(account["id"]) is writer:
                    self._connections.pop(account["id"], None)
                    await self.on_status_change(account["id"], "disconnected")
                    logger.info(f"SMPP server: '{account.get('company')}' disconnected ({peer_ip})")
            try:
                writer.close()
            except Exception:
                pass


class SmppConnectionManager:
    """Tracks one SmppConnection per active SMPP account. Call sync_with_accounts()
    whenever accounts are added/edited/removed so live connections match config."""

    def __init__(self, on_message, on_status_change):
        self.on_message = on_message
        self.on_status_change = on_status_change
        self.connections: dict[int, SmppConnection] = {}

    async def sync_with_accounts(self, accounts: list):
        wanted_ids = set()
        for acc in accounts:
            if acc.get("interconnect_type") != "smpp-client":
                continue  # only explicit outbound-client accounts get a managed connection
            if not acc.get("host") or not acc.get("port"):
                continue
            wanted_ids.add(acc["id"])
            if acc["id"] not in self.connections:
                conn = SmppConnection(acc, self.on_message, self.on_status_change)
                self.connections[acc["id"]] = conn
                conn.start()

        # Tear down connections whose account was deleted/disabled
        for acc_id in list(self.connections.keys()):
            if acc_id not in wanted_ids:
                await self.connections[acc_id].stop()
                del self.connections[acc_id]

    async def stop_all(self):
        for conn in list(self.connections.values()):
            await conn.stop()
        self.connections.clear()
