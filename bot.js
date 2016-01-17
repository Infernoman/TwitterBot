var Twitter = require('twit'),
    winston = require('winston');
 
var client = new Twitter({
  consumer_key: 'consumer_key',
  consumer_secret: 'consumer_secret',
  access_token: 'access_token',
  access_token_secret: 'access_token_secret'
});
 
// load winston's cli defaults
winston.cli();

var stream = client.stream('statuses/filter', {track: ['LIST, OF, QUOTES, TO, TRACK'] });

// retweet anything inside of "track:"
stream.on('connect', function (request) {
    winston.info('Connecting to Twitter.....');
}).on('connected', function (response) {
    winston.info('Connected to Twitter.');
}).on('disconnect', function (disconnectMessage) {
    winston.error('Disconnected from Twitter.\n'+disconnectMessage);
    winston.info('Trying to reconnect.....');
}).on('tweet', function(tweet) {
    from = tweet.user.screen_name;
    from = from.toLowerCase();
    tweetid = tweet.id_str;
    message = tweet.text
    if (tweet.user.screen_name != 'TWITTER_USERNAME') {
        winston.info('New Tweet from '+from+' with TweetId: '+ tweetid);
        winston.info(message);
        client.post('statuses/retweet/'+tweetid, {
        },  function(error, tweet, response){
        });
    }
}).on('error', function(error) {
    winston.error( error );
});