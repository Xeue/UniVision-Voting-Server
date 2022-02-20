#!/usr/bin/env node
/*jshint esversion: 6 */

const WebSocketServer = require('ws').WebSocketServer;
const fs = require('fs');
const mysql = require('mysql');
const path = require('path');
const nodemailer = require('nodemailer');

const processArgs = process.argv.slice(2);
const version = "2.0";
const type = "Server";
const loadTime = new Date().getTime();
let DBConn = 0;

let MYsqlDetails = JSON.parse(fs.readFileSync(__dirname + "/database.conf"));
let EmailDetails = JSON.parse(fs.readFileSync(__dirname + "/email.conf"));

let transporter = nodemailer.createTransport(EmailDetails);

class Datebase {
  constructor() {
    this.connection = mysql.createPool(MYsqlDetails);
    DBConn++;
    log(`${g}Connecting${w} to SQL database, current connections: ${y}${DBConn}${w}`, "S");
  }
  query(sql, args) {
    return new Promise( ( resolve, reject ) => {
      this.connection.query( sql, args, ( err, rows ) => {
        if ( err )
          return reject( err );
        resolve( rows );
        logObj("Data from DB", rows, "A");
      } );
    } );
  }
  insert(object, table, args) {
    return new Promise( ( resolve, reject ) => {
      let keys = [];
      let values = [];
      for (var variable in object) {
        if (object.hasOwnProperty(variable)) {
          keys.push(variable);
          values.push(`'${object[variable]}'`);
        }
      }
      let sql = `INSERT INTO \`${table}\` (${keys.join(',')}) VALUES (${values.join(',')})`;
      this.connection.query( sql, args, ( err, result, fields ) => {
        if ( err )
          return reject( err );
        resolve( result );
        logObj("Inserted into DB", result, "A");
      } );
    } );
  }
  update(object, where, table, args) {
    return new Promise( ( resolve, reject ) => {

      let values = [];
      for (var variable in object) {
        if (object.hasOwnProperty(variable)) {
          values.push(`\`${variable}\`='${object[variable]}'`);
        }
      }
      let sql = `UPDATE \`${table}\` SET ${values.join(',')}`;
      if (typeof where !== "undefined") {
        let wheres = [];
        for (var col in where) {
          if (where.hasOwnProperty(col)) {
            wheres.push(`\`${col}\`='${where[col]}'`);
          }
        }
        sql += ' WHERE '+wheres.join(' AND ');
      }

      this.connection.query( sql, args, ( err, result, fields ) => {
        if ( err )
          return reject( err );
        resolve( result );
        logObj("Updated DB", result, "A");
      } );
    } );
  }
  close() {
    return new Promise( ( resolve, reject ) => {
      DBConn--;
      log(`${r}Closing${w} connection to SQL database, current connections: ${y}${DBConn}${w}`, "S");
      this.connection.end( err => {
        if ( err )
          return reject( err );
        resolve();
      } );
    } );
  }
}

let myID = `S_${loadTime}_${version}`;
let port = 3001;
let host = "vote.chilton.tv";
let loggingLevel = "D";
let debugLineNum = true;
let createLogFile = true;
let argLoggingLevel;
let ownHTTPserver = false;
let dataBase;
let certPath;
let keyPath;
let serverName = "Voting Server v2";
let printPings = true;
let voteCodes = ["SURREY", "TESTIN"];
let status;
let acts;
let countOnVerify = true;

let r = "\x1b[31m";
let g = "\x1b[32m";
let y = "\x1b[33m";
let b = "\x1b[34m";
let p = "\x1b[35m";
let c = "\x1b[36m";
let w = "\x1b[37m";
let reset = "\x1b[0m";
let dim = "\x1b[2m";
let bright = "\x1b[1m";

loadArgs();

printHeader();

log(`Starting server: ${y}${path.basename(__filename)}${w}`);

startServer();

function startServer() {
  log(`Running as ${y}standalone${w} websocket server`);
  log(`WebTally server running on port: ${y}${port}${w}`);
  switch (loggingLevel) {
    case "A":
      log(`Logging set to ${y}All${w}`);
      break;
    case "D":
      log(`Logging set to ${y}Debug${w}`);
      break;
    case "W":
      log(`Logging set to ${y}Warning${w} & ${y}Error${w}`);
      break;
    case "E":
      log(`Logging set to ${y}Error${w} only`);
      break;
    default:
  }
  let today = new Date();
  let dd = String(today.getDate()).padStart(2, '0');
  let mm = String(today.getMonth() + 1).padStart(2, '0'); //January is 0!
  let yyyy = today.getFullYear();
  let fileName = `${configLocation}/logs/voteServer-[${yyyy}-${mm}-${dd}].log`;
  log(`Logging to file: ${y}${fileName}${w}`);
  log("Show line number in logs set to: "+debugLineNum);
  coreServer = new WebSocketServer({ port: port });
  log("Started Websocket server");
  const MConn = new Datebase();


  MConn.query(`SELECT count(*) as count
    FROM information_schema.TABLES
    WHERE (TABLE_SCHEMA = 'univision') AND (TABLE_NAME = 'main_votes')
  `).then((rows)=>{
    if (rows[0].count == 0) {
      log("Votes table doesn't exist, creating new one", "S");
      MConn.query(`CREATE TABLE \`main_votes\` (
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
      ) ENGINE=InnoDB DEFAULT CHARSET=latin1;
      `);
    }
  });

  MConn.query(`SELECT count(*) as count
  FROM information_schema.TABLES
  WHERE (TABLE_SCHEMA = 'univision') AND (TABLE_NAME = 'main_acts')
  `).then((rows)=>{
    if (rows[0].count == 0) {
      log("Acts table doesn't exist, creating new one", "S");
      MConn.query(`CREATE TABLE \`main_acts\` (
        \`PK\` int(11) NOT NULL,
        \`uniLongName\` text NOT NULL,
        \`uniShortName\` text NOT NULL,
        \`uniImage\` text NOT NULL,
        \`uniEmail\` text NOT NULL,
        \`actName\` text NOT NULL,
        \`actImage\` text NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=latin1;
      `);
    }
  });

  MConn.query(`SELECT count(*) as count
  FROM information_schema.TABLES
  WHERE (TABLE_SCHEMA = 'univision') AND (TABLE_NAME = 'main_bans')
  `).then((rows)=>{
    if (rows[0].count == 0) {
      log("Bans table doesn't exist, creating new one", "S");
      MConn.query(`CREATE TABLE \`main_bans\` (
        \`PK\` int(11) NOT NULL,
        \`IP\` varchar(256) NOT NULL,
        \`timestamp\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=latin1;
      `);
    }
  });

  MConn.query(`SELECT count(*) as count
  FROM information_schema.TABLES
  WHERE (TABLE_SCHEMA = 'univision') AND (TABLE_NAME = 'main_status')
  `).then((rows)=>{
    if (rows[0].count == 0) {
      log("Status table doesn't exist, creating new one", "S");
      MConn.query(`CREATE TABLE \`main_status\` (
        \`status\` varchar(256) NOT NULL,
        \`timestamp\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=latin1;
      `);
    }
  });

  MConn.query(`SELECT count(*) as count
  FROM information_schema.TABLES
  WHERE (TABLE_SCHEMA = 'univision') AND (TABLE_NAME = 'main_judge')
  `).then((rows)=>{
    if (rows[0].count == 0) {
      log("Judge table doesn't exist, creating new one", "S");
      MConn.query(`CREATE TABLE \`main_judge\` (
        \`act\` int(11) NOT NULL,
        \`points\` int(11) NOT NULL,
        \`timestamp\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=latin1;
      `);
    }
  });

  MConn.query('SELECT * FROM main_acts;').then((rows)=>{
    log("Loaded acts info");
    acts = rows;
    startLoops(MConn);
  });

  // Main websocket server functionality
  coreServer.on('connection', function connection(socket, req) {
    log("New connection established, sending it meta data", "D");

    MConn.query('SELECT * FROM main_acts;').then((rows)=>{
      let data = {};
      acts = rows;
      rows.forEach( (row) => {
        data[row.PK] = {};
        data[row.PK].email = row.uniEmail;
        data[row.PK].logo = row.uniImage;
        data[row.PK].name = row.uniLongName;
        data[row.PK].short = row.uniShortName;
        data[row.PK].act = row.actName;
        data[row.PK].actImage = row.actImage;
      });
      let actsJSON = `{"type":"voteActs","data":${JSON.stringify(data)}}`;
      MConn.query('SELECT `status` FROM main_status;').then((rows)=>{
        status = rows[0].status;
        let statusJSON = `{"type":"voteStatus","status":"${rows[0].status}"}`;
        MConn.query('SELECT `IP` FROM main_bans;').then((rows)=>{
          let IPs = [];
          rows.forEach( (row) => {
            IPs.push(row.IP);
          });
          let bansJSON = `{"type":"voteBans","IPs":${JSON.stringify(IPs)}}`;
          MConn.query(`SELECT * FROM main_judge`).then((rows)=>{
            let points = {}
            rows.forEach( (row) => {
              points[row.act] = row.points
            });
            let judgeJSON = JSON.stringify({"type":"voteJudge","points":points});
            socket.send(actsJSON);
            socket.send(statusJSON);
            socket.send(bansJSON);
            socket.send(judgeJSON);
          });
        });
      });
    });

    socket.pingStatus = "alive";

    socket.on('message', function message(msgJSON) {
      let msgObj = {};
      try {
        msgObj = JSON.parse(msgJSON);
        if (msgObj.type !== "ping" && msgObj.type !== "pong") {
          logObj('Received', msgObj, "A");
        } else if (printPings == true) {
          logObj('Received', msgObj, "A");
        }
        switch (msgObj.type) {
          case "voteAdmin":
            commandAdmin(msgObj, socket, MConn);
            break;
          case "voteStart":
            commandStart(msgObj, socket, req);
            break;
          case "vote":
            commandVote(msgObj, socket, req);
            break;
          case "voteConfirm":
            commandConfirm(msgObj, socket, MConn);
            break;
          case "voteEdit":
            commandEdit(msgObj, socket);
            break;
          case "pong":
            socket.pingStatus = "alive";
            break;
          case "voteJudge":
            MConn.query(`SELECT * FROM main_judge WHERE act='${msgObj.act}'`).then((rows)=>{
              handelJudgeUpdates(msgObj, rows, MConn).then(()=>{
                MConn.query(`SELECT * FROM main_judge`).then((rows)=>{
                  let points = {}
                  rows.forEach( (row) => {
                    points[row.act] = row.points
                  });
                  log("Relaying judge votes", "D");
                  sendAll({"type":"voteJudge","points":points});
                });
              });
            });
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
        log(`${r}${oldId}${reset} Connection closed`, "D");
        socket.connected = false;
      } catch (e) {
        log("Could not end connection cleanly","E");
      }
    });
  });

  coreServer.on('error', function() {
    log("Server failed to start or crashed, please check the port is not in use", "E");
    process.exit(1);
  });
}

function commandAdmin(msgObj, socket, SQLConn) {
  log(`Client asking server to run command: ${b}${msgObj.command}${w}`, "D");
  const MConn = new Datebase();
  switch (msgObj.command) {
    case "status":
      let colour;
      if (msgObj.status == "OPEN") {
        colour = g;
      } else {
        colour = r;
      }
      log(`Setting status to: ${colour}${msgObj.status}${w}`, "D");
      MConn.query(`UPDATE \`main_status\` SET \`status\`='${msgObj.status}';`).then((rows)=>{
        MConn.close();
        log("Updated voting status", "D");
        status = msgObj.status;
        sendAll(`{"type":"voteStatus","status":"${msgObj.status}"}`);
      });
      break;
    case "getMeta":
      socket.admin = true;
      MConn.query(`SELECT * FROM \`main_votes\` WHERE act IS NOT NULL;`).then((rows)=>{
        log("Sending votes to admin", "D");
        let packet = {};
        packet.type = "voteMeta";
        packet.votes = rows;
        socket.send(JSON.stringify(packet));
        MConn.close();
      });
      break;
    case "verify":
      MConn.query(`UPDATE \`main_votes\` SET \`verified\`=1 WHERE \`PK\`=${msgObj.PK};`).then(()=>{
        MConn.close();
        if (countOnVerify) {
          countTotals(SQLConn);
        }
        updateVoteAdmin(msgObj.PK);
      });
      break;
    case "unVerify":
      MConn.query(`UPDATE \`main_votes\` SET \`verified\`=0 WHERE \`PK\`=${msgObj.PK};`).then(()=>{
        MConn.close();
        if (countOnVerify) {
          countTotals(SQLConn);
        }
        updateVoteAdmin(msgObj.PK).then((rows)=>{
          verifyEmail(msgObj.PK);
        });
      });
      break;
    case "exclude":
      MConn.query(`UPDATE \`main_votes\` SET \`enabled\`=0 WHERE \`PK\`=${msgObj.PK};`).then(()=>{
        if (countOnVerify) {
          countTotals(SQLConn);
        }
        MConn.close();
        updateVoteAdmin(msgObj.PK);
      });
      break;
    case "include":
      MConn.query(`UPDATE \`main_votes\` SET \`enabled\`=1 WHERE \`PK\`=${msgObj.PK};`).then(()=>{
        if (countOnVerify) {
          countTotals(SQLConn);
        }
        MConn.close();
        updateVoteAdmin(msgObj.PK);
      });
      break;
    case "banIP":
      MConn.query(`INSERT INTO \`main_bans\` (\`IP\`) VALUES ('${msgObj.IP}');`).then(()=>{
        MConn.query(`SELECT \`IP\` FROM \`main_bans\`;`).then((rows)=>{
          let IPs = [];
          rows.forEach( (row) => {
            IPs.push(row.IP);
          });
          sendAll(`{"type":"voteBans","IPs":${JSON.stringify(IPs)}}`);
          MConn.query(`UPDATE \`main_votes\` SET \`enabled\`=0 WHERE \`IP\`='${msgObj.IP}';`).then(()=>{
            MConn.query(`SELECT * FROM \`main_votes\` WHERE \`IP\`='${msgObj.IP}' AND act IS NOT NULL;`).then((rows)=>{
              MConn.close();
              let packet = {};
              packet.type = "voteMeta";
              packet.votes = rows;
              let jsonPacket = JSON.stringify(packet);
              coreServer.clients.forEach(function each(client) {
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
      MConn.query(`DELETE FROM \`main_bans\` WHERE \`IP\`='${msgObj.IP}';`).then(()=>{
        MConn.query(`SELECT \`IP\` FROM \`main_bans\`;`).then((rows)=>{
          let IPs = [];
          rows.forEach( (row) => {
            IPs.push(row.IP);
          });
          sendAll(`{"type":"voteBans","IPs":${JSON.stringify(IPs)}}`);
        }).then(()=>{
          MConn.query(`UPDATE \`main_votes\` SET \`enabled\`=1 WHERE \`IP\`='${msgObj.IP}';`).then(()=>{
            MConn.query(`SELECT * FROM \`main_votes\` WHERE \`IP\`='${msgObj.IP}' AND act IS NOT NULL;`).then((rows)=>{
              MConn.close();
              let packet = {};
              packet.type = "voteMeta";
              packet.votes = rows;
              let jsonPacket = JSON.stringify(packet);
              coreServer.clients.forEach(function each(client) {
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
      MConn.query(`ALTER TABLE \`main_votes\` RENAME TO \`old_votes_${day}-${hr}-${min}\`;`).then((rows)=>{
        MConn.query("CREATE TABLE `main_votes` (`PK` int(11) NOT NULL,`act` int(11) DEFAULT NULL,`fromUni` int(11) NOT NULL,`code` varchar(256) DEFAULT NULL,`email` varchar(256) NOT NULL,`verificationCode` varchar(256) DEFAULT NULL,`IP` varchar(256) NOT NULL,`enabled` tinyint(1) NOT NULL DEFAULT '1',`verified` tinyint(1) NOT NULL DEFAULT '0',`dateVote` timestamp NULL DEFAULT NULL) ENGINE=InnoDB DEFAULT CHARSET=latin1;").then(()=>{
          sendAll(`{"type":"adminReset"}`);
          MConn.close();
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
  /*if (typeof msgObj.code === "undefined") {
    if (voteCodes.includes(msgObj.code)) {
      vote.code = msgObj.code;
    } else {
      socket.send('{"type":"voteInvalidCode"}');
      break;
    }
  }*/
  const MConn = new Datebase();
  MConn.query(`SELECT * FROM \`main_votes\` WHERE \`email\`='${msgObj.email}';`).then((rows)=>{
    if (rows.length == 0) {
      MConn.insert(vote, "main_votes").then((result)=>{
        MConn.close();
        socket.send(`{"type":"voteRegistered","PK":"${result.insertId}"}`);
      });
    } else if (rows[0].act == "" || rows[0].act == null) {
      MConn.close();
      socket.send(`{"type":"voteRegistered","PK":"${rows[0].PK}"}`);
    } else {
      MConn.close();
      socket.send(`{"type":"voteAlready","PK":"${rows[0].PK}"}`);
    }
  });
}

function commandVote(msgObj, socket, req) {
  let date = new Date().toISOString().slice(0, 19).replace('T', ' ');
  let socketIP = req.headers['cf-connecting-ip'] || req.socket.remoteAddress;
  const MConn = new Datebase();
  MConn.query(`SELECT IP FROM main_bans WHERE IP='${socketIP}'`).then((rows)=>{

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

    MConn.update(voteData, {"PK":msgObj.PK}, "main_votes").then((result)=>{
      MConn.close();
      socket.send(`{"type":"voteSaved","PK":"${msgObj.PK}"}`);
      logObj("Return data", result);
      updateVoteAdmin(msgObj.PK);
      verifyEmail(msgObj.PK);
    });
  });
}

function commandConfirm(msgObj, socket, SQLConn) {
  if (status == "OPEN") {
    const MConn = new Datebase();
    MConn.update({"verified":1},{"verificationCode":msgObj.confirmationCode}, "main_votes").then((result)=>{
      MConn.query(`SELECT * FROM \`main_votes\` WHERE \`verificationCode\`='${msgObj.confirmationCode}';`).then((rows)=>{
        MConn.close();
        if (countOnVerify) {
          countTotals(SQLConn);
        }
        let packet = {};
        packet.type = "voteMeta";
        packet.votes = rows;
        let jsonPacket = JSON.stringify(packet);
        coreServer.clients.forEach(function each(client) {
          if (client.admin == true && client.readyState === 1) {
            client.send(jsonPacket);
          }
        });
        return rows;
      });
    });
  }
}

function commandEdit(msgObj, socket) {
  log(`Client asking server to edit acts`, "D");
  const MConn = new Datebase();
  switch (msgObj.command) {
    case "new":
      let data = {
        "uniLongName":"Full name",
        "uniShortName":"Short name",
        "uniImage":"URL of the Uni image",
        "uniEmail":"Email extension of the Uni",
        "actName":"The acts name",
        "actImage":"URL of the acts image"
      };
      MConn.insert(data, "main_acts").then((result)=>{
        MConn.query('SELECT * FROM main_acts;').then((rows)=>{
          let data = {};
          acts = rows;
          rows.forEach( (row) => {
            data[row.PK] = {};
            data[row.PK].email = row.uniEmail;
            data[row.PK].logo = row.uniImage;
            data[row.PK].name = row.uniLongName;
            data[row.PK].short = row.uniShortName;
            data[row.PK].act = row.actName;
            data[row.PK].actImage = row.actImage;
          });
          sendAll(`{"type":"voteActs","data":${JSON.stringify(data)}}`);
          MConn.close();
        });
      });
      break;
    case "save":
      let actsData = msgObj.data;
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

          MConn.update(updateData, {'PK':actPK}, "main_acts").then((result)=>{
            MConn.query('SELECT * FROM main_acts;').then((rows)=>{
              let data = {};
              acts = rows;
              rows.forEach( (row) => {
                data[row.PK] = {};
                data[row.PK].email = row.uniEmail;
                data[row.PK].logo = row.uniImage;
                data[row.PK].name = row.uniLongName;
                data[row.PK].short = row.uniShortName;
                data[row.PK].act = row.actName;
                data[row.PK].actImage = row.actImage;
              });
              sendAll(`{"type":"voteActs","data":${JSON.stringify(data)}}`);
              MConn.close();
            });
          });
        }
      }
      break;
    case "delete":
      MConn.query(`DELETE FROM main_acts WHERE PK='${msgObj.PK}'`).then((row)=>{
        MConn.query(`DELETE FROM main_acts WHERE act='${msgObj.PK}'`).then((row)=>{
          MConn.query(`DELETE FROM main_acts WHERE fromUni='${msgObj.PK}'`).then((row)=>{
            MConn.query('SELECT * FROM main_acts;').then((rows)=>{
              let data = {};
              acts = rows;
              rows.forEach( (row) => {
                data[row.PK] = {};
                data[row.PK].email = row.uniEmail;
                data[row.PK].logo = row.uniImage;
                data[row.PK].name = row.uniLongName;
                data[row.PK].short = row.uniShortName;
                data[row.PK].act = row.actName;
                data[row.PK].actImage = row.actImage;
              });
              sendAll(`{"type":"voteActs","data":${JSON.stringify(data)}}`);
              MConn.close();
            });
          });
        });
      });
      break;
    default:

  }
}

function handelJudgeUpdates(msgObj, rows, MConn) {
  if (rows.length > 0) {
    return MConn.update({"points":msgObj.points}, {"act":msgObj.act}, "main_judge");
  } else {
    return MConn.insert({"act":msgObj.act, "points":msgObj.points},"main_judge");
  }
}

function sendAll(json) {
  let obj = {};
  if (typeof json == "object") {
    obj = json;
  } else {
    obj = JSON.parse(json);
  }

  coreServer.clients.forEach(function each(client) {
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
  coreServer.clients.forEach(function each(client) {
    if (client.admin == true && client.readyState === 1) {
      client.send(JSON.stringify(obj));
    }
  });
}

function updateVoteAdmin(PK, MConn) {
  if (typeof MConn === "undefined") {
    MConn = new Datebase();
  }
  return MConn.query(`SELECT * FROM \`main_votes\` WHERE \`PK\`='${PK}';`).then((rows)=>{
    let packet = {};
    packet.type = "voteMeta";
    packet.votes = rows;
    sendAdmins(packet);
    return rows;
  }).then((rows)=>{
    MConn.close();
    return rows;
  });
}

function verifyEmail(PK) {
  const MConn = new Datebase();
  return MConn.query(`SELECT * FROM \`main_votes\` WHERE \`PK\`='${PK}';`).then((rows)=>{

    let mailOptions = {
      "from": 'Univision Voting <mail@univision.show>',
      "to": rows[0].email,
      "subject": 'Univision Vote confirmation',
      "text": `Thank you for your vote!
      Please click https://univision.show/voteConfirmation/?code=${rows[0].verificationCode} to confirm your vote.`,
      "html": `Thank you for your vote!<br />Please click <a href='https://univision.show/voteConfirmation/?code=${rows[0].verificationCode}'>Verify</a> to confirm your vote.<br />Or go to: https://univision.show/voteConfirmation/?code=${rows[0].verificationCode}<br /><br />We hope you have enjoyed the show.`
    };
    log(mailOptions, "A");
    transporter.sendMail(mailOptions, function(error, info){
      if (error) {
        log(error, "E");
      } else {
        log(`Email sent: ${info.response}`);
      }
    });
  }).then(()=>{
    MConn.close();
  });
}

function startLoops(MConn) {
  // 5 Second ping loop
  setInterval(() => {
    doPing();
  }, 5000);

  if (countOnVerify == false) {
    setInterval(() => {
      countTotals(MConn);
    }, 20000);
  }
}

function doPing() {
  if (printPings !== false) {
    log("Doing ping", "A");
  }
  let counts = {};
  counts.alive = 0;
  counts.dead = 0;
  coreServer.clients.forEach(function each(client) {
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
  if (printPings !== false) {
    log("Clients alive: "+counts.alive, "A");
    log("Clients dead: "+counts.dead, "A");
  }
}

function countTotals(MConn) {
  log("Counting Totals");
  for (var act in acts) {
    if (acts.hasOwnProperty(act)) {
      let PK = acts[act].PK;
      MConn.query(`SELECT act, count(act) as 'count' FROM \`main_votes\` WHERE verified=1 AND enabled=1 AND fromUni = ${PK} AND act IS NOT NULL GROUP by act`).then((rows)=>{
        let tots = {};
        rows.forEach( (row) => {
          tots[row.act] = row.count;
        });
        let json = {
          "type":"voteTotal",
          "PK":PK,
          "total":tots
        };
        sendAdmins(json);
      });
    }
  }

  MConn.query("SELECT act, count(act) as 'count' FROM `main_votes` WHERE verified=1 AND enabled=1 AND act IS NOT NULL GROUP by act").then((rows)=>{
    let tots = {};
    rows.forEach( (row) => {
      tots[row.act] = row.count;
    });
    let json = {
      "type":"voteTotals",
      "totals":tots
    };
    sendAdmins(json);
    log("Counted Totals");
  });
}

function loadArgs() {
  if (typeof processArgs[0] !== "undefined") {
    if (processArgs[0] == ".") {
      processArgs[0] = "";
    }
    configLocation = __dirname+processArgs[0];
  } else {
    configLocation = __dirname;
  }

  if (typeof processArgs[1] !== "undefined") {
    loggingLevel = processArgs[1];
  }
}

function printHeader() {

  console.log("");
  console.log(" _    _         _ __      __ _       _                __      __     _    _                      ___  ");
  console.log("| |  | |       (_)\\ \\    / /(_)     (_)               \\ \\    / /    | |  (_)                    |__ \\ ");
  console.log("| |  | | _ __   _  \\ \\  / /  _  ___  _   ___   _ __    \\ \\  / /___  | |_  _  _ __    __ _  __   __ ) |");
  console.log("| |  | || '_ \\ | |  \\ \\/ /  | |/ __|| | / _ \\ | '_ \\    \\ \\/ // _ \\ | __|| || '_ \\  / _` | \\ \\ / // / ");
  console.log("| |__| || | | || |   \\  /   | |\\__ \\| || (_) || | | |    \\  /| (_) || |_ | || | | || (_| |  \\ V // /_ ");
  console.log(" \\____/ |_| |_||_|    \\/    |_||___/|_| \\___/ |_| |_|     \\/  \\___/  \\__||_||_| |_| \\__, |   \\_/|____|");
  console.log("                                                                                     __/ |            ");
  console.log("                                                                                    |___/    ");
  console.log("");

  logFile("", true);
  logFile(" _    _         _ __      __ _       _                __      __     _    _                      ___  ", true);
  logFile("| |  | |       (_)\\ \\    / /(_)     (_)               \\ \\    / /    | |  (_)                    |__ \\ ", true);
  logFile("| |  | | _ __   _  \\ \\  / /  _  ___  _   ___   _ __    \\ \\  / /___  | |_  _  _ __    __ _  __   __ ) |", true);
  logFile("| |  | || '_ \\ | |  \\ \\/ /  | |/ __|| | / _ \\ | '_ \\    \\ \\/ // _ \\ | __|| || '_ \\  / _` | \\ \\ / // / ", true);
  logFile("| |__| || | | || |   \\  /   | |\\__ \\| || (_) || | | |    \\  /| (_) || |_ | || | | || (_| |  \\ V // /_ ", true);
  logFile(" \\____/ |_| |_||_|    \\/    |_||___/|_| \\___/ |_| |_|     \\/  \\___/  \\__||_||_| |_| \\__, |   \\_/|____|", true);
  logFile("                                                                                     __/ |            ", true);
  logFile("                                                                                    |___/    ", true);
  logFile("", true);
}

function log(message, level, lineNumInp) {
  let e = new Error();
  let stack = e.stack.toString().split(/\r\n|\n/);
  let filename = path.basename(__filename)+":";
  let lineNum = '('+stack[2].substr(stack[2].indexOf(filename)+filename.length);
  if (typeof lineNumInp !== "undefined") {
    lineNum = lineNumInp;
  }
  if (lineNum[lineNum.length - 1] !== ")") {
    lineNum += ")";
  }
  let timeNow = new Date();
  let hours = String(timeNow.getHours()).padStart(2, "0");
  let minutes = String(timeNow.getMinutes()).padStart(2, "0");
  let seconds = String(timeNow.getSeconds()).padStart(2, "0");
  let millis = String(timeNow.getMilliseconds()).padStart(3, "0");

  let timeString = `${hours}:${minutes}:${seconds}.${millis}`;

  if (typeof message === "undefined") {
    log(`Log message from line ${p}${lineNum}${reset} is not defined`, "E");
    return;
  } else if (typeof message !== "string") {
    log(`Log message from line ${p}${lineNum}${reset} is not a string so attemping to stringify`, "A");
    try {
      message = JSON.stringify(message, null, 4);
    } catch (e) {
      log(`Log message from line ${p}${lineNum}${reset} could not be converted to string`, "E");
    }
  }

  if (debugLineNum == false || debugLineNum == "false") {
    lineNum = "";
  }

  message = message.replace(/true/g, g+"true"+w);
  message = message.replace(/false/g, r+"false"+w);
  message = message.replace(/null/g, y+"null"+w);
  message = message.replace(/undefined/g, y+"undefined"+w);

  //const regexp = / \((.*?):(.[0-9]*):(.[0-9]*)\)"/g;
  //let matches = message.matchAll(regexp);
  //for (let match of matches) {
    //message = message.replace(match[0],`" [${y}${match[1]}${reset}] ${p}(${match[2]}:${match[3]})${reset}`);
  //}

  let msg;
  switch (level) {
    case "A":
      if (loggingLevel == "A") { //White
        logSend(`[${timeString}]${w}  INFO: ${dim}${message}${bright} ${p}${lineNum}${reset}`);
      }
      break;
    case "D":
      if (loggingLevel == "A" || loggingLevel == "D") { //Cyan
        logSend(`[${timeString}]${c} DEBUG: ${w}${message} ${p}${lineNum}${reset}`);
      }
      break;
    case "W":
      if (loggingLevel != "E") { //Yellow
        logSend(`[${timeString}]${y}  WARN: ${w}${message} ${p}${lineNum}${reset}`);
      }
      break;
    case "E": //Red
      logSend(`[${timeString}]${r} ERROR: ${w}${message} ${p}${lineNum}${reset}`);
      break;
    case "S": //Blue
      logSend(`[${timeString}]${b} NETWK: ${w}${message} ${p}${lineNum}${reset}`);
      break;
    default: //Green
      logSend(`[${timeString}]${g}  CORE: ${w}${message} ${p}${lineNum}${reset}`);
  }
}

function logObj(message, obj, level) {
  let e = new Error();
  let stack = e.stack.toString().split(/\r\n|\n/);
  let filename = path.basename(__filename)+":";
  let lineNum = '('+stack[2].substr(stack[2].indexOf(filename)+filename.length);

  let combined = `${message}: ${JSON.stringify(obj, null, 4)}`;
  log(combined, level, lineNum);
}

function logSend(message) {
  logFile(message);
  console.log(message);
}

function logFile(msg, sync = false) {
  if (createLogFile) {
    let dir = `${configLocation}/logs`;

    if (!fs.existsSync(dir)){
      fs.mkdirSync(dir, { recursive: true });
    }

    let today = new Date();
    let dd = String(today.getDate()).padStart(2, '0');
    let mm = String(today.getMonth() + 1).padStart(2, '0');
    let yyyy = today.getFullYear();

    let fileName = `${dir}/voteServer-[${yyyy}-${mm}-${dd}].log`;
    //let data = msg.replaceAll(r, "").replaceAll(g, "").replaceAll(y, "").replaceAll(b, "").replaceAll(p, "").replaceAll(c, "").replaceAll(w, "").replaceAll(reset, "").replaceAll(dim, "").replaceAll(bright, "")+"\n";
    let data = msg;

    if (sync) {
      try {
        fs.appendFileSync(fileName, data);
      } catch (error) {
        createLogFile = false;
        log("Could not write to log file, permissions?", "E");
      }
    } else {
      fs.appendFile(fileName, data, err => {
        if (err) {
          createLogFile = false;
          log("Could not write to log file, permissions?", "E");
        }
      });
    }
  }
}
