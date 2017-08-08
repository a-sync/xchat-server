FROM node:6

ENV PORT="8090"
ENV API_KEY="xxx"

EXPOSE 8090

RUN mkdir /xchat-server
WORKDIR /xchat-server

ENTRYPOINT ["node", "server"]

LABEL description="xchat server"