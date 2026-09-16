@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Fretboard Lab - 练琴

rem ---- 已经在跑就不再启第二个（strictPort 会直接报错退出）----
netstat -ano | findstr /C:":5180" | findstr /C:"LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo 服务已经在运行，直接打开浏览器 ...
  start "" "http://127.0.0.1:5180"
  exit /b 0
)

echo.
echo   Fretboard Lab 正在启动，浏览器会自动打开：
echo   http://127.0.0.1:5180
echo.
echo   练琴期间请保留这个窗口，关掉它就停止服务了（可以最小化）。
echo.

call npm.cmd run dev -- --open
