FROM python:3.12.11-slim-bookworm

ARG PROTEUS_VERSION

RUN python -m pip install --no-cache-dir "proteus==${PROTEUS_VERSION}"

WORKDIR /oracle
COPY oracle.py /oracle/oracle.py

ENTRYPOINT ["python", "/oracle/oracle.py"]
