'use strict';

const redis = require('redis').createClient(process.env.REDIS_URL);
const http = require('http');
const socketIO = require('socket.io');

const gv_url = 'http://balloon.greenwalkers.com/cgi-bin/sr.cgi?gotpos=';

get();

function get() {
	redis.get('gv:lastPos', function (err, lastPos){
		if (!lastPos) lastPos = 0;
		console.log(gv_url + lastPos);
		http.get(gv_url + lastPos, (res) => {
			let body = '';
			res.setEncoding('utf8');

			res.on('data', (chunk) => {
				body += chunk;
			});

			res.on('end', (res) => {
				let gv = parseGV(body);
				redis.get('gv:trackdata', function (err, val){
					let trackdata = JSON.parse(val);
					if (trackdata){
						for (let id in gv.data) {
							if (trackdata[id]){
								Array.prototype.push.apply(trackdata[id], gv.data[id]);
							}else{
								trackdata[id] = gv.data[id];
							}
						}
					}else{
						trackdata = gv.data;
					}
					redis.set('gv:lastPos', gv.lastPos);
					redis.set('gv:trackdata', JSON.stringify(trackdata));
					console.log('update: ' + gv.lastPos);
				});
			});
		}).on('error', (e) => {
			console.log(e.message);
		});
	});
}



function parseGV(file) {
	var log = {};
	var data = file.split("\n");
	var status = parseInt(data[0]);
	var lastPos = parseInt(data[1]);

	for (var i = 2; i < data.length; i++ ){
		if ( data[i].match(/MARK/) ){

		}else if ( data[i].match(/\$GP/) ){
			var parsed = {};
			var res = parsePositionData(data[i]);
			parsed[res.format] = res;

			if ( data[i+1] ){
				if (! data[i+1].match(/MARK/) ){
					res = parsePositionData(data[i+1]);
					i++;
					parsed[res.format] = res;
				}
			}

			if ( parsed.RMC && parsed.GGA && parsed.RMC.id && parsed.RMC.id == parsed.GGA.id ){
				if ( log[parsed.RMC.id] == undefined ){
					log[parsed.RMC.id] = [];
				}
				log[parsed.RMC.id].push({
					time: parseInt(parsed.RMC.time) * 1000,
					lat: parsed.RMC.lat,
					lng: parsed.RMC.lng,
					speed: parseInt(parsed.RMC.speed * 10) / 10,
					direction: parsed.RMC.direction,
					altitude: parsed.GGA.altitude
				});
			}
		}
	}
	return { lastPos: lastPos, data: log };
}

// RMC: time, status, lat, N/S, lng, E/W, speed, direction, date, ...
// GGA: time, lat, N/S, lng, E/W, quality, satellite, HDOP, altitude, ...
function parsePositionData(line) {
	line.match(/([\w\.]+)\s+(\d+)\s\$GP(.{3}),(.+)/);
	var id = RegExp.$1;
	// var pos = RegExp.$2;
	var format = RegExp.$3;
	var data = RegExp.$4.split(",");

	if ( format == "RMC" ){
		if ( data[1] == "V" ){
			return { format: "RMC" };
		}else{
			return {
				id: id,
				format: "RMC",
				time: data[0],
				lat: _degree(data[2]) * ((data[3]=="N") ? 1 : -1),
				lng: _degree(data[4]) * ((data[5]=="E") ? 1 : -1),
				speed: parseFloat(data[6]) * 0.514,  // (m/s)
				direction: parseFloat(data[7])
			};
		}
	}else if ( format == "GGA" ){
		if ( data[5] == "0" ){
			return { format: "GGA" };
		}else{
			return {
				id: id,
				format: "GGA",
				time: data[0],
				lat: _degree(data[1]) * ((data[2]=="N") ? 1 : -1),
				lng: _degree(data[3]) * ((data[4]=="E") ? 1 : -1),
				altitude: parseFloat(data[8])
			};
		}
	}
}

function _degree(degree){
	degree.match(/(\d+)(\d{2}\.\d+)/);
	var d = parseInt(RegExp.$1);
	var m = parseFloat(RegExp.$2);
	return d + m /60;
}

