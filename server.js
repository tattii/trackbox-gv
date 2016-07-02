'use strict';

const express = require('express');
const socketIO = require('socket.io');
const path = require('path');

const PORT = process.env.PORT || 3000;
const INDEX = path.join(__dirname, 'index.html');

const redis = require('redis').createClient(process.env.REDIS_URL);

const app = express();
const server = app
  .get('/', (req, res) => res.sendFile(INDEX) )
  .use(express.static('public'))
  .listen(PORT, () => console.log(`Listening on ${ PORT }`));

const io = socketIO(server);

io.on('connection', (socket) => {
  console.log('Client connected');

  // send current data
  redis.get('gv:trackdata', (err, val) => {
    socket.emit('init', val);
  });

  socket.on('disconnect', () => console.log('Client disconnected'));
});

io.on('update-data', (data) => {
  io.emit('update', data);
});

