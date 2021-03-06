var Twitter = require('twit'),
	coin = require('node-altcoin'),
	yaml = require('js-yaml'),
	winston = require('winston'),
        fs = require('fs');

// check if the config file exists
if (!fs.existsSync('./config/twitter.yml')) {
    winston.error('Configuration file doesn\'t exist! Please read the README.md file first.');
    process.exit(1);
}

// load settings
var settings = yaml.load(fs.readFileSync('./config/twitter.yml', 'utf-8'));
var shortCoin = settings.coin.short_name;
var twitterUsername = settings.twitter.username.toLowerCase();

var client = new Twitter({
  consumer_key: settings.twitter.consumer_key,
  consumer_secret: settings.twitter.consumer_secret,
  access_token: settings.twitter.access_token,
  access_token_secret: settings.twitter.access_token_secret
});

// load winston's cli defaults
winston.cli();

// write logs to file
if (settings.log.file) {
    winston.add(winston.transports.File, {
        filename: settings.log.file,
        level: 'info'
    });
}

// connect to coin json-rpc
winston.info('Connecting to coind...');

var coin = coin({
    host: settings.rpc.host,
    port: settings.rpc.port,
    user: settings.rpc.user,
    pass: settings.rpc.pass
});

coin.getBalance(function(err, balance) {
    if (err) {
        winston.error('Could not connect to %s RPC API! ', settings.coin.full_name, err);
        process.exit(1);
        return;
    }

    var balance = typeof(balance) == 'object' ? balance.result : balance;
    winston.info('Connected to JSON RPC API. Current total balance is %d ' + shortCoin, balance);
});

var stream = client.stream('statuses/filter', {track: ['@'+twitterUsername]})

  stream.on('tweet', function(tweet) {
        from = tweet.user.screen_name;
        from = from.toLowerCase();
        var message = tweet.text.toLowerCase();
        if (from != twitterUsername) {
            var random = Math.random().toFixed(3);

            if(message.indexOf("@"+twitterUsername+" ") != -1){
                var message = message.substr(message.indexOf("@"+twitterUsername+" ") + (twitterUsername.length+1));
            }

            var match = message.match(/^(!)(\S+)/);
            if (match === null) return;

            var prefix = match[1];
            var command = match[2];
            tweetid = tweet.id_str;
            winston.info('New Tweet from '+from+' with TweetId: '+ tweetid);
            winston.info(match);

            // if command doesnt match return
            if (settings.commands[command]) {
            } else {
            	winston.info('Could not find command '+command);
                client.post('statuses/update', {
                    status: "@"+from+" I'm sorry, I don't recognize that command (R+="+random+')',
                    in_reply_to_status_id: tweetid
                },  function(error, tweet, response){
                    winston.info('sending reply to @' + from + ' from tweet id ' + tweetid);
                });
                return;
            }
	    //commands
            switch (command) {
                case 'balance':
                    coin.getBalance(from, 3, function(err, balance) {
                        if (err) {
                            winston.error('Error in !balance command', err);
                            client.post('statuses/update', {
                               status: 'Could not get balance for @'+from+' (R+='+random+')',
                               in_reply_to_status_id: tweetid
                            },  function(error, tweet, response){
                            });
                            return;
                        }
                        var balance = typeof(balance) == 'object' ? balance.result : balance;
                        winston.info(from+"'s Balance is " + balance);

                        coin.getBalance(from, 0, function(err, unconfirmed_balance) {
                            if (err) {
                                winston.error('Error in !balance command', err);
                                client.post('statuses/update', {
                                   status: 'Could not get balance for @'+from+' (R+='+random+')',
                                   in_reply_to_status_id: tweetid
                                },  function(error, tweet, response){
                                });
                                return;
                            }
                            var unconfirmed_balance = typeof(unconfirmed_balance) == 'object' ? unconfirmed_balance.result : unconfirmed_balance - balance;
                            winston.info(from+"'s Unconfirmed_Balance is " + unconfirmed_balance);
                            client.post('statuses/update', {
                               status: '@'+from+', Your current balance  is ' + balance +' $'+shortCoin+'. ( Unconfirmed: ' +unconfirmed_balance+ ' ) (R+='+random+')',
                               in_reply_to_status_id: tweetid
                            },  function(error, tweet, response){
                            });
                	});
            	    });
                break;

                case 'address':
                    winston.debug('Requesting address for %s', from);
                    coin.send('getaccountaddress', from, function(err, address) {
                        if (err) {
                            winston.error('Something went wrong while getting address. ' + err+' (R+='+random+')');
                            client.post('statuses/update', {
                                status: '@'+from+" I'm sorry, something went wrong while getting the address."+' (R+='+random+')',
                                in_reply_to_status_id: tweetid
                            },  function(error, tweet, response){
                            });
                            return;
                        }

                        client.post('statuses/update', {
                            status: '@'+from+', Your deposit address is '+address +' (R+='+random+')',
                            in_reply_to_status_id: tweetid
                        },  function(error, tweet, response){
                            winston.info('Sending address to '+from);
                        });
                    });
                break;

                case 'tip':
                    var match = message.match(/^.?tip (\S+) ([\d\.]+)/);
                    if (match === null || match.length < 3) {
                        client.post('statuses/update', {
                            status: '@'+from+', Usage: !tip <nickname> <amount> @'+twitterUsername+' (R+='+random+')',
                            in_reply_to_status_id: tweetid
                        },  function(error, tweet, response){
                        });
                        return;
                    }
                    var to = match[1];
                    to = to.toLowerCase().replace('@','');
                    var amount = Number(match[2]);
                    winston.info('from: '+from+' to: '+to+' amount: '+amount);

                    if (!amount || amount == 0 || amount == null) {
                        client.post('statuses/update', {
                            status: '@'+from+', '+amount+ ' is an invalid amount'+' (R+='+random+')',
                            in_reply_to_status_id: tweetid
                        },  function(error, tweet, response){
                        });
                        return;
                    }

                    if (to == from) {
                        client.post('statuses/update', {
                            status: '@'+from+" I'm sorry, You cant tip yourself !" +' (R+='+random+')',
                            in_reply_to_status_id: tweetid
                        },  function(error, tweet, response){
                        });
                        return;
                    }

                    if (amount < settings.coin.min_tip) {
                        client.post('statuses/update', {
                            status: '@'+from+" I'm sorry, your tip to @"+to+' ('+amount.toFixed(8)+' $'+shortCoin+') is too small (min. '+'0.1 '+shortCoin+')' +' (R+='+random+')',
                            in_reply_to_status_id: tweetid
                        },  function(error, tweet, response){
                        });
                        return;
                    }

                    // check balance with min. 5 confirmations
                    coin.getBalance(from, 3, function(err, balance) {
                        if (err) {
                            winston.error('Error in !tip command.', err);
                            client.post('statuses/update', {
                                status: 'Could not get balance for @'+from+' (R+='+random+')',
                                in_reply_to_status_id: tweetid
                            },  function(error, tweet, response){
                            });
                            return;
                        }
                        var balance = typeof(balance) == 'object' ? balance.result : balance;

                        if (balance >= amount) {
                            coin.send('move', from, to, amount, function(err, reply) {
                                if (err || !reply) {
                                    winston.error('Error in !tip command', err);
                                    client.post('statuses/update', {
                                        status: 'Could not move coins from @'+from+' to @' + to + ' (R+='+random+')',
                                        in_reply_to_status_id: tweetid
                                    },  function(error, tweet, response){
                                    });
                                    return;
                                }

                                winston.info('%s tipped %s %d %s', from, to, amount, shortCoin);
                                    client.post('statuses/update', {
                                        status: '@'+from+' tipped @' + to +' '+ amount.toFixed(8) +' $'+shortCoin+' Tweet "@'+twitterUsername+' !help" to claim your tip ! (R+='+random+')',
                                        in_reply_to_status_id: tweetid
                                    },  function(error, tweet, response){
                                    });
                            });
                        } else {
                            short = amount - balance;
                            winston.info('%s tried to tip %s %d, but has only %d', from, to, amount.toFixed(8), balance);
                            client.post('statuses/update', {
                                status: '@'+from+" I'm sorry, you dont have enough funds (you are short "+short.toFixed(8)+' $'+shortCoin+') (R+='+random+')',
                                in_reply_to_status_id: tweetid
                            },  function(error, tweet, response){
                            });
                        }
                    });
                break;
                case 'withdraw':
                    console.log(message.match(/^.?withdraw (\S+)$/));
                    var match = message.match(/^.?withdraw (\S+)$/);
                    if (match === null) {
                        client.post('statuses/update', {
                            status: "@"+from+', Usage: <@'+twitterUsername+' !withdraw [' + settings.coin.full_name + ' address]> (R+='+random+')',
                            in_reply_to_status_id: tweetid
                        },  function(error, tweet, response){
                        });
                        return;
                    }
                    var address = match[1];

                    coin.validateAddress(address, function(err, reply) {
                        if (err) {
                            winston.error('Error in !withdraw command', err);
                            client.post('statuses/update', {
                                status: "@"+from+" I'm Sorry, something went wrong with the address validation. (R+="+random+')',
                                in_reply_to_status_id: tweetid
                            },  function(error, tweet, response){
                            });
                            return;
                        }

                        if (reply.isvalid) {
                            coin.getBalance(from, settings.coin.min_confirmations, function(err, balance) {
                                if (err) {
                                    client.post('statuses/update', {
                                        status: "@"+from+", I'm Sorry I could not get your balance"+' (R+='+random+')',
                                        in_reply_to_status_id: tweetid
                                    },  function(error, tweet, response){
                                    });
                                    return;
                                }
                                var balance = typeof(balance) == 'object' ? balance.result : balance;
                                short = 5 - balance ;
                                var fee = balance - settings.coin.withdrawal_fee
                                if (balance < settings.coin.min_withdraw) {
                                    winston.warn('%s tried to withdraw %d, but min is set to %d', from, balance, settings.coin.min_withdraw);
                                    client.post('statuses/update', {
                                        status: "@"+from+" I'm sorry, the minimum withdrawal amount is 5 $"+shortCoin+" you are short "+short.toFixed(8)+' $'+shortCoin+' (R+='+random+')',
                                        in_reply_to_status_id: tweetid
                                    },  function(error, tweet, response){
                                    });
                                    return;
                                }
                            
                                coin.sendFrom(from, address, fee, function(err, reply) {
                                    if (err) {
                                        winston.error('Error in !withdraw command', err);
                                        client.post('statuses/update', {
                                            status: 'Could not move coins from @' + from + ' to ' + address + ' (R+='+random+')',
                                            in_reply_to_status_id: tweetid
                                        },  function(error, tweet, response){
                                        });
                                        return;
                                    }

                                    client.post('statuses/update', {
                                        status: '@'+from+ ': ' + fee + ' $'+shortCoin+' has been withdrawn from your account to '+address,
                                        in_reply_to_status_id: tweetid
                                   	},  function(error, tweet, response){
                                        winston.info('Sending '+ fee +' $'+shortCoin+' to '+address+' for @'+from);
                                    });

                                    // transfer the rest (usually withdrawal fee - txfee) to bots wallet
                                    coin.getBalance(from, function(err, balance) {
                                        if (err) {
                                            winston.error('Something went wrong while transferring fees', err);
                                            return;
                                        }
                                        var balance = typeof(balance) == 'object' ? balance.result : balance;
                                        // Move fees to tipbot
                                        coin.move(from, '""', balance);

                                        coin.getBalance(from, function(err, balance) {
                                            if (err) {
                                                winston.error('Something went wrong while transferring fees', err);
                                                return;
                                            }
                                            var balance = typeof(balance) == 'object' ? Math.abs(balance.result) : Math.abs(balance);

                                            if (balance > 0) {
                                                // Change balance to 0
                                                coin.move('""', from, balance);
                                            }
                                        });
                                    });
                                });
                            });
                        } else {
                            winston.warn('%s tried to withdraw to an invalid address', from);
                            client.post('statuses/update', {
                                status: '@'+from+" I'm Sorry, "+address+' is invalid. (R+='+random+')',
                                in_reply_to_status_id: tweetid
                            },  function(error, tweet, response){
                            });
                        }
                    });
                break;
                case 'help':
                        client.post('statuses/update', {
                            in_reply_to_status_id: tweetid,
                            status: '@'+from+' Here is a list of commands: !balance !tip !withdraw !address (R+='+random+')'
                        },  function(error, tweet, response){
                        });
                break;
  		};
    }
  	}).on('error', function(error) {
        winston.error( error );
    }).on('connect', function (request) {
        winston.info('Connecting TipBot to Twitter.....');
    }).on('connected', function (response) {
        winston.info('Connected TipBot to Twitter.');
    }).on('disconnect', function (disconnectMessage) {
        winston.error('Disconnected TipBot from Twitter.\n'+disconnectMessage);
        winston.info('Trying to reconnect.....');
    });
