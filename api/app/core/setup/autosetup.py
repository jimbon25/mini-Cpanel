import os
import shutil
import json
import logging
from pathlib import Path
from typing import Callable, Any

logger = logging.getLogger("cpanel_lite.autosetup")

async def run_auto_setup(
    project: Any, 
    project_dir: Path, 
    db: Any, 
    run_command_fn: Callable, 
    log_activity_fn: Callable,
    start_cmd_override: str = None
) -> str:
    """
    Auto-detects project runtime (Python, Node.js, PHP, Go, Rust, Bun) and sets up its
    environment, dependencies, and runs builds. Returns the resolved startup command.
    """
    start_cmd = start_cmd_override
    port = project.port if project.port else 8000

    if (project_dir / "bun.lockb").exists() or (project_dir / "bunfig.toml").exists():
        await log_activity_fn(db, project.id, "deploy", "Bun runtime detected. Setting up dependencies...")
        bun_bin = shutil.which("bun")
        if bun_bin:
            await log_activity_fn(db, project.id, "deploy", "Running bun install...")
            code, out, err = await run_command_fn([bun_bin, "install"], cwd=str(project_dir))
            if code == 0:
                await log_activity_fn(db, project.id, "deploy", "bun install completed successfully.")
            else:
                await log_activity_fn(db, project.id, "deploy", f"[Warning] bun install failed: {err}")
                
            if (project_dir / "package.json").exists():
                try:
                    with open(project_dir / "package.json", "r", encoding="utf-8") as f:
                        pkg_data = json.load(f)
                        if "build" in pkg_data.get("scripts", {}):
                            await log_activity_fn(db, project.id, "deploy", "Running bun run build...")
                            await run_command_fn([bun_bin, "run", "build"], cwd=str(project_dir))
                except Exception:
                    pass
                    
        if not start_cmd:
            start_cmd = "bun run start"
            await log_activity_fn(db, project.id, "deploy", f"Auto-detected Bun start command: {start_cmd}")

    elif (project_dir / "package.json").exists():
        await log_activity_fn(db, project.id, "deploy", "Node.js project detected. Setting up environment...")
        npm_bin = shutil.which("npm")
        if npm_bin:
            node_modules_dir = project_dir / "node_modules"
            if not node_modules_dir.exists():
                await log_activity_fn(db, project.id, "deploy", "Running npm install to setup dependencies...")
                code, out, err = await run_command_fn([npm_bin, "install"], cwd=str(project_dir))
                if code == 0:
                    await log_activity_fn(db, project.id, "deploy", "npm install completed successfully.")
                else:
                    await log_activity_fn(db, project.id, "deploy", f"[Warning] npm install failed: {err}")
            
            try:
                with open(project_dir / "package.json", "r", encoding="utf-8") as f:
                    pkg_data = json.load(f)
                    if "build" in pkg_data.get("scripts", {}):
                        await log_activity_fn(db, project.id, "deploy", "Build script detected in package.json. Running build...")
                        code, out, err = await run_command_fn([npm_bin, "run", "build"], cwd=str(project_dir))
                        if code == 0:
                            await log_activity_fn(db, project.id, "deploy", "npm run build completed successfully.")
                        else:
                            await log_activity_fn(db, project.id, "deploy", f"[Warning] npm run build failed: {err}")
            except Exception as e:
                logger.warning(f"Failed to check package.json for build script: {e}")
                
        if not start_cmd:
            start_cmd = "npm start"
            await log_activity_fn(db, project.id, "deploy", f"Auto-detected Node.js start command: {start_cmd}")

    elif (project_dir / "requirements.txt").exists() or (project_dir / "pyproject.toml").exists():
        await log_activity_fn(db, project.id, "deploy", "Python project detected. Setting up environment...")
        venv_dir = project_dir / "venv"
        if not venv_dir.exists():
            venv_dir = project_dir / ".venv"
            
        if not venv_dir.exists():
            await log_activity_fn(db, project.id, "deploy", "Creating Python virtual environment (venv)...")
            code, out, err = await run_command_fn(["python3", "-m", "venv", "venv"], cwd=str(project_dir))
            if code == 0:
                venv_dir = project_dir / "venv"
                await log_activity_fn(db, project.id, "deploy", "Virtual environment (venv) created successfully.")
            else:
                await log_activity_fn(db, project.id, "deploy", f"[Warning] Failed to create venv: {err}. Falling back to system python.")
        
        if venv_dir.exists() and (project_dir / "requirements.txt").exists():
            await log_activity_fn(db, project.id, "deploy", "Installing/Updating Python dependencies from requirements.txt...")
            pip_bin = venv_dir / "bin" / "pip"
            code, out, err = await run_command_fn([str(pip_bin), "install", "-r", "requirements.txt"], cwd=str(project_dir))
            if code == 0:
                await log_activity_fn(db, project.id, "deploy", "Python dependencies installed successfully.")
            else:
                await log_activity_fn(db, project.id, "deploy", f"[Warning] Pip install failed: {err}")
                
        if not start_cmd:
            python_bin = venv_dir / "bin" / "python" if venv_dir.exists() else "python3"
            main_file = "main.py"
            if (project_dir / "bot.py").exists():
                main_file = "bot.py"
            elif (project_dir / "app.py").exists():
                main_file = "app.py"
            elif (project_dir / "run.py").exists():
                main_file = "run.py"
            
            start_cmd = f"{python_bin} {main_file}"
            await log_activity_fn(db, project.id, "deploy", f"Auto-detected Python start command: {start_cmd}")

    elif (project_dir / "composer.json").exists() or (project_dir / "index.php").exists() or (project_dir / "artisan").exists():
        await log_activity_fn(db, project.id, "deploy", "PHP project detected. Setting up dependencies...")
        composer_bin = shutil.which("composer")
        if composer_bin and (project_dir / "composer.json").exists():
            await log_activity_fn(db, project.id, "deploy", "Running composer install...")
            code, out, err = await run_command_fn([composer_bin, "install", "--no-dev", "--optimize-autoloader"], cwd=str(project_dir))
            if code == 0:
                await log_activity_fn(db, project.id, "deploy", "Composer install completed successfully.")
            else:
                await log_activity_fn(db, project.id, "deploy", f"[Warning] Composer install failed: {err}")

        if not start_cmd:
            if (project_dir / "artisan").exists():
                start_cmd = f"php artisan serve --host=0.0.0.0 --port={port}"
            else:
                start_cmd = f"php -S 0.0.0.0:{port}"
            await log_activity_fn(db, project.id, "deploy", f"Auto-detected PHP start command: {start_cmd}")

    elif (project_dir / "go.mod").exists() or (project_dir / "main.go").exists():
        await log_activity_fn(db, project.id, "deploy", "Go project detected. Building binary...")
        go_bin = shutil.which("go")
        if go_bin:
            await log_activity_fn(db, project.id, "deploy", "Compiling Go application (go build)...")
            code, out, err = await run_command_fn([go_bin, "build", "-o", "app"], cwd=str(project_dir))
            if code == 0:
                await log_activity_fn(db, project.id, "deploy", "Go compilation completed successfully.")
            else:
                await log_activity_fn(db, project.id, "deploy", f"[Warning] Go build failed: {err}")
                
        if not start_cmd:
            if (project_dir / "app").exists():
                start_cmd = "./app"
            else:
                start_cmd = "go run main.go"
            await log_activity_fn(db, project.id, "deploy", f"Auto-detected Go start command: {start_cmd}")

    elif (project_dir / "Cargo.toml").exists():
        await log_activity_fn(db, project.id, "deploy", "Rust project detected. Building release binary...")
        cargo_bin = shutil.which("cargo")
        if cargo_bin:
            await log_activity_fn(db, project.id, "deploy", "Compiling Rust application (cargo build --release)...")
            code, out, err = await run_command_fn([cargo_bin, "build", "--release"], cwd=str(project_dir))
            if code == 0:
                await log_activity_fn(db, project.id, "deploy", "Rust compilation completed successfully.")
            else:
                await log_activity_fn(db, project.id, "deploy", f"[Warning] Cargo build failed: {err}")
                
        if not start_cmd:
            bin_name = project.name.lower()
            target_bin = project_dir / "target" / "release" / bin_name
            if target_bin.exists():
                start_cmd = f"./target/release/{bin_name}"
            else:
                release_dir = project_dir / "target" / "release"
                binaries = [f.name for f in release_dir.iterdir() if f.is_file() and os.access(f, os.X_OK)] if release_dir.exists() else []
                if binaries:
                    start_cmd = f"./target/release/{binaries[0]}"
                else:
                    start_cmd = "cargo run --release"
            await log_activity_fn(db, project.id, "deploy", f"Auto-detected Rust start command: {start_cmd}")

    if not start_cmd:
        start_cmd = "python main.py"

    return start_cmd
