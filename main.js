var net = require('net');
var msnsocket = require('./MSNHelper.js');
const axios = require('axios');
const EventEmitter = require('events');
var os = require('os');
const { NOTINITIALIZED } = require('dns');
const internal = require('stream');

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
		this.client = new net.Socket();

		this.active = false;

		this.switchboard = [];
	}

	execute() {
		this.client.connect(1863, 'msnmsgr.escargot.chat', () => {
			console.log('[DEBUG] Connected to MSN Server');
			this.client.write('VER 0 MSNP9 CVR0' + endTag);
		});

		this.client.on('data', async data => {
			this.TrID++;
			let parsed = msnsocket.parseMessage(data);
			console.log(parsed);
			if(parsed != undefined) {
				parsed.forEach(async element => {
					if(element[0] == 'VER' && element[2] == 'MSNP9') {
						console.log('[DEBUG] System info sent')
						this.client.write('CVR 2 0x0409 '+process.platform+' '+os.version+' '+process.arch+' NODEMSN 5.0.0544 MSMSGS ' + this.login + endTag);
					}

					if(element[0] == 'CVR') {
						console.log('[DEBUG] [AUTH] Trying to log in...')
						this.client.write('USR 3 TWN I ' + this.login + endTag);
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
								if (this.token == 'failed') {
									console.log('[DEBUG] [AUTH] Incorrect login or password');
									this.emit('msg', {'type': 'auth_failed'});
									this.client.destroy();
									delete this;
								}else{
									console.log('[DEBUG] [AUTH] Success');
								}
								
							})
							.catch(err => console.log('error ', this.emit(err)));
						this.client.write('USR 4 TWN S ' + this.token + endTag);
						this.client.write('CHG 5 NLN 0' + endTag);
						this.TrID = 6;
						this.active = true;
					}

					if(element[0] == 'USR' && element[2] == 'OK'){
						this.email = element[3];
						this.name = element[4];
						this.emit('msg', {'type': 'connected'});
					}

					if(element[0] == 'RNG' && element[3] == 'CKI') {
						console.log('[DEBUG] Accepting request');
						let server = new String(element[2]).split(':');
						if (this.switchboard[element[5]] == undefined) {
							this.switchboard[element[5]] = new MSNSwitchBoard(server[0], server[1], element[5], this.email);
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

					if(element[0] == 'OUT') {
						console.log('[DEBUG] Exit requested by server');
						this.client.destroy();
						delete this;
						this.emit('close');
					}

					// Errors
					
					if(element[0] == '911') {
						if(this.active == false) {
							console.log('[DEBUG] [AUTH] Incorrect login or password');
							this.emit('msg', {'type': 'auth_failed'});
							this.client.destroy();
							delete this;
						}
					}
				});
			}
		});

		this.client.on('close', () => {
			this.emit('close');
			this.active = false;
		});

	}

	getUserInfo() {
		return {'active': this.active,
				'email': this.email,
				'name': this.name};
	}
	
	async sendMessage(emailArg, bodyArg) {
		if(this.active == true) {
			if(this.switchboard[emailArg] != null) {
				this.switchboard[emailArg].sendMessage(bodyArg);
			} else {
				this.TrID++;
				this.client.write('XFR ' + this.TrID +' SB' + endTag);
				this.client.on('data', data => {
					let parsed = msnsocket.parseMessage(data);
					console.log(parsed);
					if(parsed != undefined) {
						parsed.forEach(async element => {
							if(element[0] == 'XFR' && element[2] == 'SB') {
								let server = new String(element[3]).split(':');
								this.switchboard[emailArg] = new MSNSwitchBoard(server[0], server[1], emailArg, this.email);
								this.switchboard[emailArg].execute();
								this.switchboard[emailArg].authorizeAndSendMessage(element[5], bodyArg);
							}
						});
					}
				});
			}
		}
	}
	
	/**
	 * This function will change the Presence of profile.
	 * 
	 * @param {MSNStatuses} status The Status
	 */
	async changePresence(status) {
		/*
			Use MSNStatuses const 

			Statuses:
			NLN - Available
			BSY - Busy
			IDL - Idle
			BRB - Be Right Back
			AWY - Away
			PHN - On the Phone
			LUN - Out to Lunch
		*/
		if(this.active == true) {
			this.client.write('CHG ' + this.TrID + ' ' + status + ' 0' + endTag);
		}
	}

	listContacts(callback) {
		if(this.active == true) {
			let contactList = [];
			let contactListCount = 0;
			
			let contactListCountTmp = 1;
			this.client.write('SYN 1 0' + endTag);
			this.client.on('data', data => {
				this.TrID++;
				let parsed = msnsocket.parseMessage(data);
				if(parsed != undefined) {
					parsed.forEach(element => {
						if (element[0] == 'SYN' && element[1] == '1' && element[2] == '1') {
							contactListCount = parseInt(element[3]);
						} else if (element[0] == 'LST') {
							contactListCountTmp++;
							if (contactListCountTmp <= contactListCount) {
								let contact = {email: element[1], name: decodeURI(element[2])};
								contactList.push(contact);
							}
						}
					});
				}

				if(contactList.length+1 == contactListCount) {
					callback(contactList);
				}
			});
		}
	}
};

class MSNSwitchBoard extends EventEmitter {
	constructor(server, port, email, selfEmail) {
		super();
		this.email = email;
		this.selfEmail = selfEmail;
		this.server = server;
		this.port = port;
		this.TrID = 0;
		this.switchboard = new net.Socket();
		this.ThreadID = Math.random()*0.001;

		// Temp
		this.tmpMessage = '';

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
			if(parsed.type == 'joinedChat') {
				this.sendMessage(this.tmpMessage);
			}else if(parsed.type == 'authSuccess') {
				console.log('CAL ' + this.TrID + ' ' + this.email + endTag);
				this.switchboard.write('CAL ' + this.TrID + ' ' + this.email + endTag);
			}else{
				this.emit('msg', parsed);
			}
		});
		
		this.switchboard.on('error', err => {
			console.log(err);
		})
	}

	acceptRequest(session, auth) {
		this.switchboard.write('ANS 1 '+this.selfEmail+' '+auth+' '+session+ endTag);
	}

	authorizeAndSendMessage(token, body) {
		this.switchboard.write('USR ' + this.TrID + ' ' + this.selfEmail + ' ' + token + endTag);
		this.tmpMessage = body;
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

// Variables

const MSNStatuses = {
	Avaliable: 'NLN',
	Busy: 'BSY',
	Idle: 'IDL',
	BeRightBack: 'BRB',
	Away: 'AWY',
	OnThePhone: 'PHN',
	OutOfLunch: 'LUN'
}

exports.MSNClient = MSNClient;
exports.MSNStatuses = MSNStatuses;
