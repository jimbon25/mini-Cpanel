import sys
from getpass import getpass
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parent))

try:
    from app.core.database import SessionLocal
    from app.models.base import User
    from app.core.security import get_password_hash
except ImportError as e:
    print(f"Error: Could not import app modules. Make sure you run this script from the 'api' directory.")
    print(f"Details: {e}")
    sys.exit(1)

def main():
    print("==================================================")
    print("      Mini cPanel Admin Password Reset CLI        ")
    print("==================================================")
    
    db = SessionLocal()
    try:
        username = input("Enter new/existing Admin Username [default: admin]: ").strip()
        if not username:
            username = "admin"
            
        role = input("Enter User Role (super_admin / developer / viewer) [default: super_admin]: ").strip().lower()
        if not role:
            role = "super_admin"
        if role not in ["super_admin", "developer", "viewer"]:
            print(f"Error: Invalid role '{role}'. Valid roles are: super_admin, developer, viewer.")
            sys.exit(1)
            
        password = getpass("Enter new Admin Password: ")
        if not password:
            print("Error: Password cannot be empty.")
            sys.exit(1)
            
        confirm_password = getpass("Confirm new Admin Password: ")
        if password != confirm_password:
            print("Error: Passwords do not match.")
            sys.exit(1)
            
        hashed_password = get_password_hash(password)
        
        user = db.query(User).filter(User.username == username).first()
        if user:
            user.password_hash = hashed_password
            user.role = role
            print(f"\nUpdating password & role ({role}) for existing user: {username}...")
        else:
            user = User(
                username=username,
                password_hash=hashed_password,
                role=role
            )
            db.add(user)
            print(f"\nCreating new user: {username} with role: {role}...")
            
        db.commit()
        print("Success: Admin credentials successfully updated in SQLite database!")
        print("==================================================")
        
    except Exception as e:
        print(f"\nError occurred while updating database: {e}")
        db.rollback()
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    main()
