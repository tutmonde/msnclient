var net = require('net');
var msnsocket = require('./MSNHelper.js');
const axios = require('axios');
const EventEmitter = require('events');
var os = require('os');

const endTag = "\r\n";

class MSNClient extends EventEmitter  {
	constructor(login, password) {
		super();
		this.login = login;
		this.password = password;

		this.token = '';
		this.TrID = 0;
		this.email = '';
		this.name = '';

		this.active = false;

		this.switchboard = [];
	}

	execute() {
		var client = new net.Socket();
		client.connect(1863, 'msnmsgr.escargot.chat', function() {
			console.log('[DEBUG] Connected to MSN Server');
			client.write('VER 0 MSNP9 CVR0' + endTag);
		});

		client.on('data', async data => {
			this.TrID++;
			let parsed = msnsocket.parseMessage(data);
			console.log(parsed);
			if(parsed != undefined) {
				parsed.forEach(async element => {
					if(element[0] == 'VER' && element[2] == 'MSNP9') {
						console.log('[DEBUG] System info sent')
						client.write('CVR 2 0x0409 '+process.platform+' '+os.version+' '+process.arch+' NODEMSN 5.0.0544 MSMSGS ' + this.login + endTag);
					}

					if(element[0] == 'CVR') {
						console.log('[DEBUG] [AUTH] Trying to log in...')
						client.write('USR 3 TWN I ' + this.login + endTag);
					}

					if(element[0] == 'USR' && element[2] == 'TWN'){
						console.log('[DEBUG] [AUTH] Connecting to Nexus');
						let tokenu = '';
						await axios.get("https://msnmsgr.escargot.chat/login", {
							headers:{"Authorization":"Passport1.4 OrgVerb=GET,OrgURL=http%3A%2F%2Fmessenger%2Emsn%2Ecom,sign-in=" + this.login + ",pwd=" + this.password + ",ct=1,rver=1,wp=FS_40SEC_0_COMPACT,lc=1,id=1"}
						})
							.then(Response => {
								tokenu = Response.headers['authentication-info'];
								this.token = msnsocket.parseToken(tokenu);
								console.log('[DEBUG] [AUTH] Got the token!');
							})
							.catch(err => console.log('error ', this.emit(err)));
						client.write('USR 4 TWN S ' + this.token + endTag);
						client.write('CHG 5 NLN 0' + endTag);
						this.TrID = 6;
						this.active = true;
					}

					if(element[0] == 'USR' && element[2] == 'OK'){
						this.email = element[3];
						this.name = element[4];
					}

					if(element[0] == 'RNG' && element[3] == 'CKI') {
						console.log('[DEBUG] Accepting request');
						let server = new String(element[2]).split(':');
						if (this.switchboard[element[5]] == undefined) {
							this.switchboard[element[5]] = new MSNSwitchBoard(server[0], server[1], element[5]);
							this.switchboard[element[5]].execute();
							this.switchboard[element[5]].on('connected', () => {this.switchboard[element[5]].acceptRequest(this.email, element[1], element[4]);})
						
							this.switchboard[element[5]].on('msg', msg => {
								if (msg != undefined) {
									this.emit('msg', msg);
									if(msg.type == 'bye') {
										delete this.switchboard[element[5]];	
									}
								}
							});
						}
						
					}
				});
			}
		});

		client.on('close', () => {
			this.emit('close');
			this.active = false;
		});

	}

	async sendMessage(emailArg, bodyArg) {
		if(this.active == true) {
			if(this.switchboard[emailArg] != null) {
				this.switchboard[emailArg].sendMessage(bodyArg);
			}
		}
	}
};

class MSNSwitchBoard extends EventEmitter {
	constructor(server, port, email) {
		super();
		this.email = email;
		this.server = server;
		this.port = port;
		this.TrID = 0;
		this.switchboard = new net.Socket();
		this.ThreadID = Math.random()*0.001;

		console.log('[DEBUG] [SWITCHBOARD: ' + this.ThreadID + '] Created');
	}

	execute() {
		this.switchboard.connect(this.port, this.server, () => {
			console.log('[DEBUG] [SWITCHBOARD: ' + this.ThreadID + '] Connected to Switchboard Server');
			this.emit('connected');
		});

		this.switchboard.on('data',  data => {
			this.TrID++;
			let parsed = msnsocket.parseMessageSB(data, this.email);
			this.emit('msg', parsed);
		});
		
		this.switchboard.on('error', err => {
			console.log(err);
		})
	}

	acceptRequest(email, session, auth) {
		this.switchboard.write('ANS 1 '+email+' '+auth+' '+session+ endTag);
	}

	sendMessage(body) {
		let msg = 'MIME-Version: 1.0'+endTag+
				'Content-Type: text/plain; charset=UTF-8'+endTag+
				'X-MMS-IM-Format: FN=Arial; EF=I; CO=0; CS=0; PF=22'+endTag+endTag+
				body;
		this.switchboard.write( 'MSG '+this.TrID+' N ' + 
								(new TextEncoder().encode(msg)).length + ' ' 
								+ endTag+msg);
	}
}

exports.MSNClient = MSNClient;
