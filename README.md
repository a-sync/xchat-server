# xchat-server

## Install
```
git clone http://github.com/peterforgacs/xchat-server
cd xchat-server
docker build -t xchat-server-image .
npm install
```

## Run
```
docker run -it --name=xchat-server --net=host --restart=unless-stopped -v "$PWD":/xchat-server xchat-server-image
```

## Start / Stop
```
docker start xchat-server
docker stop xchat-server
```