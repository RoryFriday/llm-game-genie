@echo off
setlocal

:: Load .env if present (copy .env.example to .env and fill in your keys)
if exist .env (
    for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
        :: Skip blank lines and comments
        if not "%%A"=="" (
            echo %%A | findstr /b "#" >nul || set "%%A=%%B"
        )
    )
)

:: Ensure at least one provider key is set
if not defined GEMINI_API_KEY if not defined ANTHROPIC_API_KEY (
    echo Error: No API key found.
    echo Set GEMINI_API_KEY or ANTHROPIC_API_KEY in your environment or in a .env file.
    echo See .env.example for the template.
    exit /b 1
)

:: Default provider to gemini if not set
if not defined LLM_PROVIDER set "LLM_PROVIDER=gemini"

call npm install --silent
call npx electron-rebuild -m . -o active-win
call npm start
