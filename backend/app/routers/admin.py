from fastapi import APIRouter

router = APIRouter(prefix="/admin", tags=["admin"])
# reset-db is registered in main.py so it's always available
