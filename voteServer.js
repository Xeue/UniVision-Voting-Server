#!/usr/bin/env node
/*jshint esversion: 6 */
const serverID = new Date().getTime();

import { WebSocketServer } from 'ws';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import {log, logObj, logs} from 'xeue-logs';
import http from 'http';
import cors from 'cors';
import express from 'express';
import {config} from 'xeue-config';
import {SQLSession} from 'xeue-sql';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);
const nodemailer = require('nodemailer');

const {version} = require('./package.json');
const type = 'Server';

{ /* Config */
	logs.printHeader('UniVision Voting');
	config.useLogger(logs);

	config.require('port', [], 'What port shall the server use');
	config.require('host', [], 'What url/IP is the server connected to from');
	config.require('serverName', [], 'Please name this server');
	config.require('loggingLevel', {'A':'All', 'D':'Debug', 'W':'Warnings', 'E':'Errors'}, 'Set logging level');
	config.require('createLogFile', {true: 'Yes', false: 'No'}, 'Save logs to local file');
	config.require('countOnVerify', [], 'Recount votes everytime a new vote is verified (can cause perfomance issues)');
  config.require('status', {'OPEN': 'Open', 'EARLY': 'Early', 'CLOSED': 'Closed'}, 'The current status of voting');

  config.require('emailService', [], 'Email provider (https://nodemailer.com/smtp/well-known/)');
  config.require('emailUser', [], 'Username');
  config.require('emailPass', [], 'Password');

  config.require('dbHost', [], 'Database address');
  config.require('dbPort', [], 'Database port');
  config.require('dbUser', [], 'Database username');
  config.require('dbPass', [], 'Database password');
  config.require('dbDatabase', [], 'Database name');

	config.require('advancedMode', {true: 'Yes', false: 'No'}, 'Show advanced config options?');
	{
		config.require('debugLineNum', {true: 'Yes', false: 'No'}, 'Show line numbers in logs', ['advancedMode', true]);
		config.require('printPings', {true: 'Yes', false: 'No'}, 'Print ping messages', ['advancedMode', true]);
	}

	config.default('port', 8080);
	config.default('host', 'localhost');
	config.default('serverName', 'Voting Server');
	config.default('loggingLevel', 'W');
	config.default('createLogFile', true);
	config.default('debugLineNum', false);
	config.default('printPings', false);
	config.default('advancedMode', false);
  config.default('countOnVerify', true);
  config.default('dbHost', 'localhost');
  config.default('dbPort', '3306');
  config.default('dbUser', 'univision');
  config.default('dbDatabase', 'univision');
  config.default('status', 'OPEN');

	if (!await config.fromFile(__dirname + '/config.conf')) {
		await config.fromCLI(__dirname + '/config.conf');
	}

	logs.setConf({
		'createLogFile': config.get('createLogFile'),
		'logsFileName': 'VotingLogging',
		'configLocation': __dirname,
		'loggingLevel': config.get('loggingLevel'),
		'debugLineNum': config.get('debugLineNum'),
	});

	log('Running version: v'+version, ['H', 'SERVER', logs.g]);

	config.print();
	config.userInput(async (command)=>{
		switch (command) {
		case 'config':
			await config.fromCLI(__dirname + '/config.conf');
			logs.setConf({
				'createLogFile': config.get('createLogFile'),
				'logsFileName': 'VotingLogging',
				'configLocation': __dirname,
				'loggingLevel': config.get('loggingLevel'),
				'debugLineNum': config.get('debugLineNum')
			});
			SQL.init(tables);
			return true;
		}
	});
}

const transporter = nodemailer.createTransport({
	'service': config.get('emailService'),
	'auth': {
		'user': config.get('emailUser'),
		'pass': config.get('emailPass')
	}
});

const tables = [
	{
		name: 'main_votes',
		definition: `CREATE TABLE \`main_votes\` (
      \`PK\` int(11) NOT NULL,
      \`act\` int(11) DEFAULT NULL,
      \`fromUni\` int(11) NOT NULL,
      \`code\` varchar(256) DEFAULT NULL,
      \`email\` varchar(256) NOT NULL,
      \`verificationCode\` varchar(256) DEFAULT NULL,
      \`IP\` varchar(256) NOT NULL,
      \`enabled\` tinyint(1) NOT NULL DEFAULT '1',
      \`verified\` tinyint(1) NOT NULL DEFAULT '0',
      \`dateVote\` timestamp NULL DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=latin1;`,
		PK:'PK'
	},
	
	{
		name: 'main_acts',
		definition: `CREATE TABLE \`main_acts\` (
      \`PK\` int(11) NOT NULL,
      \`uniLongName\` text NOT NULL,
      \`uniShortName\` text NOT NULL,
      \`uniImage\` text NOT NULL,
      \`uniEmail\` text NOT NULL,
      \`actName\` text NOT NULL,
      \`actImage\` text NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=latin1;`,
		PK:'PK'
	},
	
	{
		name: 'main_bans',
		definition: `CREATE TABLE \`main_bans\` (
      \`PK\` int(11) NOT NULL,
      \`IP\` varchar(256) NOT NULL,
      \`timestamp\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=latin1;`,
		PK:'PK'
	},

  {
		name: 'main_status',
		definition: `CREATE TABLE \`main_status\` (
      \`status\` varchar(256) NOT NULL,
      \`timestamp\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=latin1;`,
		PK:'PK'
	},

  {
		name: 'main_judge',
		definition: `CREATE TABLE \`main_judge\` (
      \`act\` int(11) NOT NULL,
      \`points\` int(11) NOT NULL,
      \`timestamp\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=latin1;`,
		PK:'PK'
	}
];

const SQL = new SQLSession(
  config.get('dbHost'),
  config.get('dbPort'),
  config.get('dbUser'), 
  config.get('dbPass'), 
  config.get('dbDatabase'),
  logs,
  tables
);

await SQL.init(tables);

let acts;

const [serverHTTP, serverWS] = await startServers();

async function startServers() {
  const expressApp = express();
	const serverWS = new WebSocketServer({noServer: true});
	const serverHTTP = http.createServer(expressApp);

  setupExpress(expressApp);

  serverHTTP.listen(config.get('port'));
  log(`Voting server can be accessed at http://localhost:${config.get('port')}`, 'C');

  serverHTTP.on('upgrade', (request, socket, head) => {
		log('Upgrade request received', 'D');
		serverWS.handleUpgrade(request, socket, head, socket => {
			serverWS.emit('connection', socket, request);
		});
	});


  acts = await SQL.query('SELECT * FROM main_acts;');
  log("Loaded acts info");
  startLoops();

  // Main websocket server functionality
  serverWS.on('connection', async (socket, req) => {
    log("New connection established, sending it meta data", "D");

    acts = await SQL.query('SELECT * FROM main_acts;');
    const actsData = {};
    acts.forEach(act => {
      actsData[act.PK] = {
        email: act.uniEmail,
        logo: act.uniImage,
        name: act.uniLongName,
        short: act.uniShortName,
        act: act.actName,
        actImage: act.actImage
      };
    });

    const statusData = await SQL.query('SELECT `status` FROM main_status;');
    const bansData = await SQL.query('SELECT `IP` FROM main_bans;');
    const IPs = [];
    bansData.forEach(ban => {
      IPs.push(ban.IP);
    });
    const judgeData = await SQL.query(`SELECT * FROM main_judge`);
    const points = {}
    judgeData.forEach(judge => {
      points[judge.act] = judge.points
    });
    const actsJSON = `{"type":"voteActs","data":${JSON.stringify(actsData)}}`;
    const statusJSON = `{"type":"voteStatus","status":"${statusData[0].status}"}`;
    const bansJSON = `{"type":"voteBans","IPs":${JSON.stringify(IPs)}}`;
    const judgeJSON = JSON.stringify({"type":"voteJudge","points":points});
    socket.send(actsJSON);
    socket.send(statusJSON);
    socket.send(bansJSON);
    socket.send(judgeJSON);

    socket.pingStatus = "alive";

    socket.on('message', function message(msgJSON) {
      let msgObj = {};
      try {
        msgObj = JSON.parse(msgJSON);
        if (msgObj.type !== "ping" && msgObj.type !== "pong") {
          logObj('Received', msgObj, "A");
        } else if (config.get('printPings') == true) {
          logObj('Received', msgObj, "A");
        }
        switch (msgObj.type) {
          case "voteAdmin":
            commandAdmin(msgObj, socket);
            break;
          case "voteStart":
            commandStart(msgObj, socket, req);
            break;
          case "vote":
            commandVote(msgObj, socket, req);
            break;
          case "voteConfirm":
            commandConfirm(msgObj, socket);
            break;
          case "voteEdit":
            commandEdit(msgObj, socket);
            break;
          case "pong":
            socket.pingStatus = "alive";
            break;
          case "voteJudge":
            commandJudge(msgObj);
            break;
          default:
            log("Unknown message: "+msgJSON, "W");
            sendAll(msgObj);
        }
      } catch (e) {
        try {
          msgObj = JSON.parse(msgJSON);
          log("Somthing wrong with the contents of the JSON? - "+e, "E");
          log('Received: '+msgJSON, "A");
        } catch (e2) {
          log("Invalid JSON - "+e, "E");
          log('Received: '+msgJSON, "A");
        }
      }
    });

    socket.on('close', function() {
      try {
        let oldId = JSON.parse(JSON.stringify(socket.ID));
        log(`${logs.r}${oldId}${logs.reset} Connection closed`, "D");
        socket.connected = false;
      } catch (e) {
        log("Could not end connection cleanly","E");
      }
    });
  });

  serverWS.on('error', function() {
    log("Server failed to start or crashed, please check the port is not in use", "E");
    process.exit(1);
  });

  return [serverHTTP, serverWS];
}

function setupExpress(expressApp) {
	expressApp.set('views', __dirname + '/views');
	expressApp.set('view engine', 'ejs');
	expressApp.use(cors());
	expressApp.use(express.static('public'));

	expressApp.get('/', async function(request, response) {
		handleRoot(request, response);
	});

  expressApp.get('/admin', async function(request, response) {
		handleAdmin(request, response);
	});
}

async function handleRoot(request, response) {
	log('Serving index page', 'A');
	response.header('Content-type', 'text/html');
	response.render('index', {});
}

async function handleAdmin(request, response) {
	log('Serving admin page', 'A');
	response.header('Content-type', 'text/html');
	response.render('admin', {});
}

function commandAdmin(msgObj, socket) {
  log(`Client asking server to run command: ${logs.b}${msgObj.command}${logs.w}`, "D");
  switch (msgObj.command) {
    case "status":
      let colour;
      if (msgObj.status == "OPEN") {
        colour = logs.g;
      } else {
        colour = logs.r;
      }
      log(`Setting status to: ${colour}${msgObj.status}${logs.w}`, "D");
      SQL.query(`UPDATE \`main_status\` SET \`status\`='${msgObj.status}';`).then((rows)=>{
        log("Updated voting status", "D");
        config.set('status', msgObj.status);
        sendAll(`{"type":"voteStatus","status":"${msgObj.status}"}`);
      });
      break;
    case "getMeta":
      socket.admin = true;
      SQL.query(`SELECT * FROM \`main_votes\` WHERE act IS NOT NULL;`).then((rows)=>{
        log("Sending votes to admin", "D");
        let packet = {};
        packet.type = "voteMeta";
        packet.votes = rows;
        socket.send(JSON.stringify(packet));
      });
      break;
    case "verify":
      SQL.query(`UPDATE \`main_votes\` SET \`verified\`=1 WHERE \`PK\`=${msgObj.PK};`).then(()=>{
        if (config.get('countOnVerify')) {
          countTotals();
        }
        updateVoteAdmin(msgObj.PK);
      });
      break;
    case "unVerify":
      SQL.query(`UPDATE \`main_votes\` SET \`verified\`=0 WHERE \`PK\`=${msgObj.PK};`).then(()=>{
        if (config.get('countOnVerify')) {
          countTotals();
        }
        updateVoteAdmin(msgObj.PK).then(()=>{
          verifyEmail(msgObj.PK);
        });
      });
      break;
    case "exclude":
      SQL.query(`UPDATE \`main_votes\` SET \`enabled\`=0 WHERE \`PK\`=${msgObj.PK};`).then(()=>{
        if (config.get('countOnVerify')) {
          countTotals();
        }
        updateVoteAdmin(msgObj.PK);
      });
      break;
    case "include":
      SQL.query(`UPDATE \`main_votes\` SET \`enabled\`=1 WHERE \`PK\`=${msgObj.PK};`).then(()=>{
        if (config.get('countOnVerify')) {
          countTotals();
        }
        updateVoteAdmin(msgObj.PK);
      });
      break;
    case "banIP":
      SQL.query(`INSERT INTO \`main_bans\` (\`IP\`) VALUES ('${msgObj.IP}');`).then(()=>{
        SQL.query(`SELECT \`IP\` FROM \`main_bans\`;`).then((rows)=>{
          let IPs = [];
          rows.forEach( (row) => {
            IPs.push(row.IP);
          });
          sendAll(`{"type":"voteBans","IPs":${JSON.stringify(IPs)}}`);
          SQL.query(`UPDATE \`main_votes\` SET \`enabled\`=0 WHERE \`IP\`='${msgObj.IP}';`).then(()=>{
            SQL.query(`SELECT * FROM \`main_votes\` WHERE \`IP\`='${msgObj.IP}' AND act IS NOT NULL;`).then((rows)=>{
              let packet = {};
              packet.type = "voteMeta";
              packet.votes = rows;
              let jsonPacket = JSON.stringify(packet);
              serverWS.clients.forEach(function each(client) {
                if (client.admin == true && client.readyState === 1) {
                  client.send(jsonPacket);
                }
              });
            });
          });
        });
      });
      break;
    case "unBanIP":
      SQL.query(`DELETE FROM \`main_bans\` WHERE \`IP\`='${msgObj.IP}';`).then(()=>{
        SQL.query(`SELECT \`IP\` FROM \`main_bans\`;`).then((rows)=>{
          let IPs = [];
          rows.forEach( (row) => {
            IPs.push(row.IP);
          });
          sendAll(`{"type":"voteBans","IPs":${JSON.stringify(IPs)}}`);
        }).then(()=>{
          SQL.query(`UPDATE \`main_votes\` SET \`enabled\`=1 WHERE \`IP\`='${msgObj.IP}';`).then(()=>{
            SQL.query(`SELECT * FROM \`main_votes\` WHERE \`IP\`='${msgObj.IP}' AND act IS NOT NULL;`).then((rows)=>{
              let packet = {};
              packet.type = "voteMeta";
              packet.votes = rows;
              let jsonPacket = JSON.stringify(packet);
              serverWS.clients.forEach(function each(client) {
                if (client.admin == true && client.readyState === 1) {
                  client.send(jsonPacket);
                }
              });
            });
          });
        });
      });
      break;
    case "reset":
      let d = new Date();
      let day = d.getDay();
      let hr = d.getHours();
      let min = d.getMinutes();
      SQL.query(`ALTER TABLE \`main_votes\` RENAME TO \`old_votes_${day}-${hr}-${min}\`;`).then((rows)=>{
        SQL.query("CREATE TABLE `main_votes` (`PK` int(11) NOT NULL,`act` int(11) DEFAULT NULL,`fromUni` int(11) NOT NULL,`code` varchar(256) DEFAULT NULL,`email` varchar(256) NOT NULL,`verificationCode` varchar(256) DEFAULT NULL,`IP` varchar(256) NOT NULL,`enabled` tinyint(1) NOT NULL DEFAULT '1',`verified` tinyint(1) NOT NULL DEFAULT '0',`dateVote` timestamp NULL DEFAULT NULL) ENGINE=InnoDB DEFAULT CHARSET=latin1;").then(()=>{
          sendAll(`{"type":"adminReset"}`);
        });
      });
      break;
    default:
  }
}

function commandStart(msgObj, socket, req) {
  log("Client has started voting", "D");
  let myIP = req.headers['cf-connecting-ip'] || req.socket.remoteAddress;
  let vote = {
    "email": msgObj.email,
    "fromUni": msgObj.fromUni,
    "IP": myIP
  };
  SQL.query(`SELECT * FROM \`main_votes\` WHERE \`email\`='${msgObj.email}';`).then((rows)=>{
    if (rows.length == 0) {
      SQL.insert(vote, "main_votes").then((result)=>{
        socket.send(`{"type":"voteRegistered","PK":"${result.insertId}"}`);
      });
    } else if (rows[0].act == "" || rows[0].act == null) {
      socket.send(`{"type":"voteRegistered","PK":"${rows[0].PK}"}`);
    } else {
      socket.send(`{"type":"voteAlready","PK":"${rows[0].PK}"}`);
    }
  });
}

function commandVote(msgObj, socket, req) {
  let date = new Date().toISOString().slice(0, 19).replace('T', ' ');
  let socketIP = req.headers['cf-connecting-ip'] || req.socket.remoteAddress;
  SQL.query(`SELECT IP FROM main_bans WHERE IP='${socketIP}'`).then((rows)=>{

    verifyCode = date+msgObj.act+socketIP+msgObj.PK;

    let voteData = {
      "act": msgObj.act,
      "dateVote": date,
      "enabled": 1,
      "verified": 0,
      "IP": socketIP,
      "verificationCode": verifyCode.replace(/\D/g,"")
    };

    if (rows.length != 0) {
      voteData.enabled = 0;
    }

    SQL.update(voteData, {"PK":msgObj.PK}, "main_votes").then((result)=>{
      socket.send(`{"type":"voteSaved","PK":"${msgObj.PK}"}`);
      logObj("Return data", result);
      updateVoteAdmin(msgObj.PK).then(()=>{
        verifyEmail(msgObj.PK);
      });
    });
  });
}

function commandConfirm(msgObj, socket) {
  if (config.get('status') == "OPEN") {
    SQL.update({"verified":1},{"verificationCode":msgObj.confirmationCode}, "main_votes").then((result)=>{
      SQL.query(`SELECT * FROM \`main_votes\` WHERE \`verificationCode\`='${msgObj.confirmationCode}';`).then((rows)=>{
        if (config.get('countOnVerify')) {
          countTotals();
        }
        let packet = {};
        packet.type = "voteMeta";
        packet.votes = rows;
        let jsonPacket = JSON.stringify(packet);
        serverWS.clients.forEach(function each(client) {
          if (client.admin == true && client.readyState === 1) {
            client.send(jsonPacket);
          }
        });
        return rows;
      });
    });
  }
}

async function commandEdit(msgObj, socket) {
  log(`Client asking server to edit acts`, "D");
  switch (msgObj.command) {
    case "new":
      await SQL.insert({
        "uniLongName":"Full name",
        "uniShortName":"Short name",
        "uniImage":"URL of the Uni image",
        "uniEmail":"Email extension of the Uni",
        "actName":"The acts name",
        "actImage":"URL of the acts image"
      }, "main_acts");
      acts = await SQL.query('SELECT * FROM main_acts;');
      const data = {};
      acts.forEach(act => {
        data[act.PK] = {
          email: act.uniEmail,
          logo: act.uniImage,
          name: act.uniLongName,
          short: act.uniShortName,
          act: act.actName,
          actImage: act.actImage
        };
      });
      sendAll(`{"type":"voteActs","data":${JSON.stringify(data)}}`);
      break;
    case "save":
      const actsData = msgObj.data;
      for (var actPK in actsData) {
        if (actsData.hasOwnProperty(actPK)) {
          let actData = actsData[actPK];
          let updateData = {};
          if (actData.email) {updateData.uniEmail = actData.email;}
          if (actData.logo) {updateData.uniImage = actData.logo;}
          if (actData.name) {updateData.uniLongName = actData.name;}
          if (actData.short) {updateData.uniShortName = actData.short;}
          if (actData.act) {updateData.actName = actData.act;}
          if (actData.actImage) {updateData.actImage = actData.actImage;}
          await SQL.update(updateData, {'PK':actPK}, "main_acts");
        }
      }
      acts = await SQL.query('SELECT * FROM main_acts;');
      acts.forEach(act => {
        data[act.PK] = {
          email: act.uniEmail,
          logo: act.uniImage,
          name: act.uniLongName,
          short: act.uniShortName,
          act: act.actName,
          actImage: act.actImage
        };
      });
      sendAll(`{"type":"voteActs","data":${JSON.stringify(data)}}`);
      break;
    case "delete":
      await SQL.query(`DELETE FROM main_acts WHERE PK='${msgObj.PK}'`);
      await SQL.query(`DELETE FROM main_acts WHERE act='${msgObj.PK}'`);
      await SQL.query(`DELETE FROM main_acts WHERE fromUni='${msgObj.PK}'`);
      acts = await SQL.query('SELECT * FROM main_acts;');
      acts.forEach(act => {
        data[act.PK] = {
          email: act.uniEmail,
          logo: act.uniImage,
          name: act.uniLongName,
          short: act.uniShortName,
          act: act.actName,
          actImage: act.actImage
        };
      });
      sendAll(`{"type":"voteActs","data":${JSON.stringify(data)}}`);
      break;
    default:

  }
}

async function commandJudge(msgObj) {
  const judgeData = await SQL.query(`SELECT * FROM main_judge WHERE act='${msgObj.act}'`);
  await handelJudgeUpdates(msgObj, judgeData);
  const judges = await SQL.query(`SELECT * FROM main_judge`);
  const points = {}
  judges.forEach(judge => {
    points[judge.act] = judge.points
  });
  log("Relaying judge votes", "D");
  sendAll({"type":"voteJudge","points":points});
}

function handelJudgeUpdates(msgObj, rows) {
  if (rows.length > 0) {
    return SQL.update({"points":msgObj.points}, {"act":msgObj.act}, "main_judge");
  } else {
    return SQL.insert({"act":msgObj.act, "points":msgObj.points},"main_judge");
  }
}

function sendAll(json) {
  let obj = {};
  if (typeof json == "object") {
    obj = json;
  } else {
    obj = JSON.parse(json);
  }

  serverWS.clients.forEach(function each(client) {
    if (client.readyState === 1) {
      client.send(JSON.stringify(obj));
    }
  });
}

function sendAdmins(json) {
  let obj = {};
  if (typeof json == "object") {
    obj = json;
  } else {
    obj = JSON.parse(json);
  }
  serverWS.clients.forEach(function each(client) {
    if (client.admin == true && client.readyState === 1) {
      client.send(JSON.stringify(obj));
    }
  });
}

async function updateVoteAdmin(PK) {
  const votes = await SQL.query(`SELECT * FROM \`main_votes\` WHERE \`PK\`='${PK}';`);
  sendAdmins({
    "type": "voteMeta",
    "votes": votes
  });
  return votes;
}

async function verifyEmail(PK) {
  const votes = await SQL.query(`SELECT * FROM \`main_votes\` WHERE \`PK\`='${PK}';`);

  const mailOptions = {
    "from": 'Univision Voting <mail@univision.show>',
    "to": votes[0].email,
    "subject": 'Univision Vote confirmation',
    "text": `Thank you for your vote!
    Please click https://univision.show/voteConfirmation/?code=${votes[0].verificationCode} to confirm your vote.`,
    "html": `Thank you for your vote!<br />Please click <a href='https://univision.show/voteConfirmation/?code=${votes[0].verificationCode}'>Verify</a> to confirm your vote.<br />Or go to: https://univision.show/voteConfirmation/?code=${votes[0].verificationCode}<br /><br />We hope you have enjoyed the show.`
  };
  log(mailOptions, "A");
  transporter.sendMail(mailOptions, function(error, info){
    if (error) {
      log(error, "E");
    } else {
      log(`Email sent: ${info.response}`);
    }
  });
}

function startLoops() {
  // 5 Second ping loop
  setInterval(() => {
    doPing();
  }, 5000);

  if (config.get('countOnVerify') == false) {
    setInterval(() => {
      countTotals();
    }, 20000);
  }
}

function doPing() {
  if (config.get('printPings') !== false) {
    log("Doing ping", "A");
  }
  let counts = {};
  counts.alive = 0;
  counts.dead = 0;
  serverWS.clients.forEach(function each(client) {
    if (client.readyState === 1) {
      if (client.pingStatus == "alive") {
        counts.alive++;
        let payload = {};
        payload.type = "ping";
        client.send(JSON.stringify(payload));
        client.pingStatus = "pending";
      } else if (client.pingStatus == "pending") {
        client.pingStatus = "dead";
      } else {
        counts.dead++;
      }
    }
  });
  if (config.get('printPings') !== false) {
    log("Clients alive: "+counts.alive, "A");
    log("Clients dead: "+counts.dead, "A");
  }
}

function countTotals() {
  log("Counting Totals");
  for (const act in acts) {
    if (acts.hasOwnProperty(act)) {
      const PK = acts[act].PK;
      SQL.query(`SELECT act, count(act) as 'count' FROM \`main_votes\` WHERE verified=1 AND enabled=1 AND fromUni = ${PK} AND act IS NOT NULL GROUP by act`).then((rows)=>{
        const tots = {};
        rows.forEach(row => {
          tots[row.act] = row.count;
        });
        sendAdmins({
          "type":"voteTotal",
          "PK":PK,
          "total":tots
        });
      });
    }
  }

  SQL.query("SELECT act, count(act) as 'count' FROM `main_votes` WHERE verified=1 AND enabled=1 AND act IS NOT NULL GROUP by act").then((rows)=>{
    const tots = {};
    rows.forEach(row => {
      tots[row.act] = row.count;
    });
    sendAdmins({
      "type":"voteTotals",
      "totals":tots
    });
    log("Counted Totals");
  });
}
