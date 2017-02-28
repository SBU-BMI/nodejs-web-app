FROM node:latest

RUN apt-get update

RUN apt-get -y install \
apt-utils \
apparmor \
curl \
wget \
mongodb \
uuid-runtime \
zip \
unzip \
vim

RUN curl -sSL https://get.docker.com/ | sh

RUN npm install forever -g

# Create app directory
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

# Install app
COPY . /usr/src/app/
RUN npm install

EXPOSE 3000
CMD [ "forever", "app.js" ]
