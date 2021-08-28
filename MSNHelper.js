module.exports = {
    parseMessage: function(str) {
        let strr = new String(str);
        let spliced = strr.split("\r\n");
        let parsed = Array();
        spliced.forEach(element => {
            if (element != '') {
                parsed.push(element.split(' '));
            }
        });

        return parsed;
    },

    parseToken: function(str) {
        const regex = /da-status=([a-z0-9]+)/g;
        const regex2 = /from-PP='([a-z0-9]+)'/g;
        let status = regex.exec(str);
        if (status == 'failed') {
            return 'failed';
        }else{
            let result = regex2.exec(str);
            return result[1];
        }
    },

    parseMessageSB: function(str, email) {
        let msg = new String(str);
        let msnpmsg = msg.split('\r\n');
        if(msnpmsg[0].startsWith('MSG')) {
            msnpmsg.splice(0, 1);
            let parsed = [];
            msnpmsg.forEach(element => {
                const regex = /([A-Za-z\-]+): (.+)/gm;
                let tmp = regex.exec(element);
                if(tmp != null){
                    let hName = tmp[1];
                    let hContent = tmp[2];
                    parsed.push({[hName]: hContent});
                }
            });

            msnpmsg.splice(0, parsed.length+1);
            let body = msnpmsg[0];
            if(parsed[2].TypingUser) {
                return {'user': email, 'type': 'typing'};
            }else{
                return {'user': email, 'type': 'message', 'body': body};
            }
        }else if(msnpmsg[0].startsWith('BYE')) {
            return {'user': email, 'type': 'leftChat'};
        }else if(msnpmsg[0].startsWith('USR')) {
            return {'user': email, 'type': 'authSuccess'};
        }else if(msnpmsg[0].startsWith('JOI')) {
            return {'user': email, 'type': 'joinedChat'};
        }else{
            return {'user': email, 'type': 'unrecognized', 'body': msnpmsg[0]};
        }
    }
}