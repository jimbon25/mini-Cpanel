import os
import pty
import fcntl
import struct
import termios
import asyncio
import logging
from jose import jwt, JWTError
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status, Depends
from app.api.dependencies import RoleChecker
from app.core.config import settings
from app.core.database import SessionLocal
from app.models.base import User

from sqlalchemy.orm import Session
from app.core.database import get_db

logger = logging.getLogger("cpanel_lite.terminal")
router = APIRouter()


def verify_ws_token(token: str, db: Session) -> User | None:
    try:
        logger.info(f"Attempting to verify WebSocket token (length: {len(token)})")
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            logger.warning("WebSocket token payload is missing 'sub' claim.")
            return None
        user = db.query(User).filter(User.username == username).first()
        if not user:
            logger.warning(f"WebSocket token user '{username}' not found in database.")
            return None
        if user.role != "super_admin":
            logger.warning(f"WebSocket token user '{username}' rejected: Role '{user.role}' is not authorized for Terminal console.")
            return None
        return user
    except JWTError as je:
        logger.error(f"JWTError during WebSocket token verification: {je}")
        return None
    except Exception as e:
        logger.error(f"Unexpected exception in verify_ws_token: {e}", exc_info=True)
        return None


def set_winsize(fd: int, row: int, col: int):
    win = struct.pack("HHHH", row, col, 0, 0)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, win)


@router.websocket("/ws")
async def terminal_ws(
    websocket: WebSocket,
    token: str,
    db: Session = Depends(get_db)
):
    logger.info("Terminal WebSocket connection route hit.")
    user = verify_ws_token(token, db)
    if not user:
        logger.warning("Unauthenticated WebSocket connection attempt blocked.")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    logger.info(f"User '{user.username}' connected to Terminal console.")

    try:
        pid, master_fd = os.forkpty()
        logger.info(f"os.forkpty() spawned successfully. master_fd={master_fd}, pid={pid}")
    except Exception as fe:
        logger.error(f"os.forkpty() failed to spawn: {fe}", exc_info=True)
        raise fe

    if pid == 0:
        os.chdir(os.path.expanduser("~"))
        os.environ["TERM"] = "xterm-256color"
        os.environ["HOME"] = os.path.expanduser("~")
        os.environ["LANG"] = "en_US.UTF-8"
        os.environ["LC_ALL"] = "en_US.UTF-8"
        
        try:
            os.execvpe("bash", ["bash"], os.environ)
        except FileNotFoundError:
            os.execvpe("sh", ["sh"], os.environ)
        os._exit(1)

    fl = fcntl.fcntl(master_fd, fcntl.F_GETFL)
    fcntl.fcntl(master_fd, fcntl.F_SETFL, fl | os.O_NONBLOCK)

    output_queue: asyncio.Queue[bytes | None] = asyncio.Queue()

    def read_callback():
        try:
            data = os.read(master_fd, 10240)
            if data:
                output_queue.put_nowait(data)
        except OSError:
            output_queue.put_nowait(None)

    loop = asyncio.get_running_loop()
    loop.add_reader(master_fd, read_callback)

    async def write_to_ws():
        try:
            while True:
                data = await output_queue.get()
                if data is None:
                    break
                await websocket.send_bytes(data)
        except Exception as e:
            logger.error(f"Error sending data to WebSocket: {e}")

    write_task = asyncio.create_task(write_to_ws())

    try:
        while True:
            message = await websocket.receive_json()
            msg_type = message.get("type")
            if msg_type == "input":
                data = message.get("data", "")
                if data:
                    os.write(master_fd, data.encode("utf-8"))
            elif msg_type == "resize":
                cols = message.get("cols", 80)
                rows = message.get("rows", 24)
                set_winsize(master_fd, rows, cols)
    except WebSocketDisconnect:
        logger.info(f"User '{user.username}' disconnected from Terminal console.")
    except Exception as e:
        logger.error(f"Error in Terminal WebSocket connection: {e}")
    finally:
        loop.remove_reader(master_fd)
        try:
            os.close(master_fd)
        except Exception:
            pass
        try:
            os.kill(pid, 15)
        except Exception:
            pass
        output_queue.put_nowait(None)
        await write_task
