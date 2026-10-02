"""
Standalone SMPP test client — simulates exactly what a real carrier does,
so you can verify your SMPP server works BEFORE waiting for the real
carrier to connect.

Usage (on your VPS, in the same folder as main.py):

    python3 test_smpp_connection.py

By default it connects to 127.0.0.1:2775 using system_id "Axion123" and
password "123Axion" (matching the example in this conversation) — edit
the HOST / PORT / SYSTEM_ID / PASSWORD constants below to match whatever
account you actually created in the SMPP Accounts page first.

IMPORTANT: You must add the matching account in the Admin panel
(SMPP Accounts > Add Account > "SMPP Server") with the SAME System ID and
Password BEFORE running this test, otherwise the bind will be rejected —
that's expected and correct behaviour (it means your account credentials
already don't match, which is exactly what a real carrier would also hit).
"""

import asyncio
import sys
from smpp_client import (
    build_bind_transceiver, build_unbind, decode_header, encode_pdu,
    _cstr, CMD_BIND_TRANSCEIVER_RESP, CMD_SUBMIT_SM, CMD_SUBMIT_SM_RESP,
    STATUS_OK,
)

HOST = "127.0.0.1"   # use your VPS public IP instead if testing from another machine
PORT = 2775
SYSTEM_ID = "Axion123"
PASSWORD = "123Axion"
TEST_TO_NUMBER = "923001234567"   # any number — doesn't need to be a real one you own
TEST_FROM_CLI = "TestSender"
TEST_MESSAGE = "Your verification code is 999999"


def build_test_submit_sm(seq: int) -> bytes:
    """A minimal, spec-correct submit_sm PDU carrying one test OTP message."""
    msg = TEST_MESSAGE.encode("utf-8")
    body = (
        _cstr("")                      # service_type
        + bytes([0x00, 0x00])          # source_addr_ton, source_addr_npi
        + _cstr(TEST_FROM_CLI)         # source_addr
        + bytes([0x00, 0x00])          # dest_addr_ton, dest_addr_npi
        + _cstr(TEST_TO_NUMBER)        # destination_addr
        + bytes([0x00])                # esm_class
        + bytes([0x00])                # protocol_id
        + bytes([0x00])                # priority_flag
        + _cstr("")                    # schedule_delivery_time
        + _cstr("")                    # validity_period
        + bytes([0x00])                # registered_delivery
        + bytes([0x00])                # replace_if_present_flag
        + bytes([0x00])                # data_coding
        + bytes([0x00])                # sm_default_msg_id
        + bytes([len(msg)])            # sm_length
        + msg                          # short_message
    )
    return encode_pdu(CMD_SUBMIT_SM, STATUS_OK, seq, body)


async def run_test():
    print(f"→ Connecting to {HOST}:{PORT} ...")
    try:
        reader, writer = await asyncio.wait_for(asyncio.open_connection(HOST, PORT), timeout=10)
    except Exception as e:
        print(f"✗ FAILED to connect: {e}")
        print("  Check: is main.py actually running? Is the port open/not blocked by a firewall?")
        return False
    print("✓ TCP connection established")

    print(f"→ Sending bind_transceiver (system_id='{SYSTEM_ID}')...")
    writer.write(build_bind_transceiver(SYSTEM_ID, PASSWORD, 1))
    await writer.drain()

    try:
        header = await asyncio.wait_for(reader.readexactly(16), timeout=10)
    except Exception as e:
        print(f"✗ FAILED waiting for bind response: {e}")
        return False
    command_length, command_id, command_status, seq = decode_header(header)
    if command_length > 16:
        await reader.readexactly(command_length - 16)

    if command_id != CMD_BIND_TRANSCEIVER_RESP or command_status != STATUS_OK:
        print(f"✗ Bind REJECTED (status={command_status}). "
              f"Did you add an account in SMPP Accounts with System ID='{SYSTEM_ID}' and this exact password?")
        writer.close()
        return False
    print("✓ Bind SUCCESSFUL — server accepted the connection")

    print(f"→ Sending a test OTP message to {TEST_TO_NUMBER}...")
    writer.write(build_test_submit_sm(2))
    await writer.drain()

    try:
        header = await asyncio.wait_for(reader.readexactly(16), timeout=10)
    except Exception as e:
        print(f"✗ FAILED waiting for message response: {e}")
        return False
    command_length, command_id, command_status, seq = decode_header(header)
    if command_length > 16:
        await reader.readexactly(command_length - 16)

    if command_id != CMD_SUBMIT_SM_RESP or command_status != STATUS_OK:
        print(f"✗ Message REJECTED (status={command_status})")
        writer.close()
        return False
    print("✓ Message ACCEPTED by server")
    print("→ Check your Admin panel now: Live OTP Feed should show this test message,")
    print("  and SMPP Accounts should show this account as 'active'.")

    writer.write(build_unbind(3))
    await writer.drain()
    writer.close()
    return True


if __name__ == "__main__":
    print("=" * 60)
    print("MAIT SMS — SMPP Server Self-Test")
    print("=" * 60)
    ok = asyncio.run(run_test())
    print("=" * 60)
    print("RESULT: ✓ PASSED — your SMPP server is working correctly!" if ok
          else "RESULT: ✗ FAILED — see the error above.")
    print("=" * 60)
    sys.exit(0 if ok else 1)
