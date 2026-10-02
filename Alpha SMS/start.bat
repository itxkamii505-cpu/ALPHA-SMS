@echo off
echo Installing dependencies...
pip install -r requirements.txt
echo.
echo Starting Admin Panel...
echo Open http://localhost:8000 in your browser
echo.
python main.py
pause
