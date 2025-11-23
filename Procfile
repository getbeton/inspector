backend: sh -c "cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT"
frontend: sh -c "cd frontend && streamlit run Home.py --server.port $PORT --server.address 0.0.0.0"
