"""
Portable launcher for the Fraud Detection Server.
Creates a local venv, installs dependencies if needed, then starts the server.

Usage:  python run_server.py
"""
import os
import sys
import subprocess
import venv

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
VENV_DIR = os.path.join(SCRIPT_DIR, ".venv")
REQ_FILE = os.path.join(SCRIPT_DIR, "requirements.txt")
APP_FILE = os.path.join(SCRIPT_DIR, "app.py")

# Platform-specific paths inside the venv
if sys.platform == "win32":
    PYTHON = os.path.join(VENV_DIR, "Scripts", "python.exe")
    PIP = os.path.join(VENV_DIR, "Scripts", "pip.exe")
else:
    PYTHON = os.path.join(VENV_DIR, "bin", "python")
    PIP = os.path.join(VENV_DIR, "bin", "pip")

MARKER = os.path.join(VENV_DIR, ".deps_installed")


def create_venv():
    if not os.path.isdir(VENV_DIR):
        print(f"[setup] Creating virtual environment in {VENV_DIR} ...")
        venv.create(VENV_DIR, with_pip=True)
        print("[setup] Virtual environment created.")
    else:
        print("[setup] Virtual environment already exists.")


def install_deps():
    if os.path.isfile(MARKER):
        # Check if requirements changed since last install
        import hashlib
        with open(REQ_FILE, "rb") as f:
            current_hash = hashlib.sha256(f.read()).hexdigest()
        with open(MARKER) as f:
            stored_hash = f.read().strip()
        if current_hash == stored_hash:
            print("[setup] Dependencies already installed (up to date).")
            return
        print("[setup] requirements.txt changed – reinstalling ...")

    print("[setup] Installing dependencies (this may take a few minutes) ...")
    subprocess.check_call([PYTHON, "-m", "pip", "install", "--upgrade", "pip"], stdout=sys.stdout, stderr=sys.stderr)
    subprocess.check_call([PYTHON, "-m", "pip", "install", "-r", REQ_FILE], stdout=sys.stdout, stderr=sys.stderr)

    # Write marker
    import hashlib
    with open(REQ_FILE, "rb") as f:
        current_hash = hashlib.sha256(f.read()).hexdigest()
    with open(MARKER, "w") as f:
        f.write(current_hash)

    print("[setup] Dependencies installed successfully.")


def main():
    create_venv()
    install_deps()

    print("\n" + "=" * 60)
    print("  Starting Fraud Detection Server")
    print("  http://localhost:8080")
    print("=" * 60 + "\n")

    sys.exit(subprocess.call([PYTHON, APP_FILE]))


if __name__ == "__main__":
    main()
