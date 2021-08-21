# MSN Client

It's a Node.js Library to communicate with Escargot server, which is using the MSN Protocol. The goal of this Library to make use MSN/WLM in Browser or just on other native platforms than Windows.

**This library is under development, and there is a lot of 'console.log' functions called. You've been warned.**

## Getting started

Clone this repo to your Node.js project and install depends:

```bash
git clone https://github.com/tutmonde/msnclient
cd msnclient
npm i
```

## Documentation

*Coming soon ;p*

## Code examples

### Connecting to the server and responding to messages

```javascript
const MSNClient = require('./msnclient/main.js').MSNClient;

let client = new MSNClient('testacc@hotmail.com', 'verysecurepassword');

client.on('msg', msg => {
	console.log(msg);
	if (msg.type == 'message'){
		if(msg.body.startsWith('hello')){
			client.sendMessage(msg.user, 'Hi, little funny man!');
		}else{
			client.sendMessage(msg.user, 'Your message: ' + msg.body);
		}
	}
});

client.execute();
```