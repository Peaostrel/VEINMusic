from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

load_dotenv()
db_url = os.getenv("DATABASE_URL")
engine = create_engine(db_url)
try:
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE user_integrations ADD COLUMN has_imported_lastfm BOOLEAN DEFAULT FALSE;"))
        conn.commit()
    print("Migration successful")
except Exception as e:
    print(f"Error: {e}")
