from fastapi import FastAPI

app = FastAPI(title="Railway Test API")


@app.get("/")
def read_root():
    return {"message": "Hello from FastAPI on Railway!"}


@app.get("/hello/{name}")
def say_hello(name: str):
    return {"message": f"Hello, {name}!"}
