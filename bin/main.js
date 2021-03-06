// This loads the environment variables from the .env file
require('dotenv-extended').load({
    errorOnMissing: true
});

var express = require('express');

//botframework
var builder = require('botbuilder');
var restify = require('restify');

// var webot = require('weixin-robot');

var amap = require('./amap.js');
var whether = require('./whether.js');

var mongod = require('./mongod');

//LUIS
var model = 'https://westus.api.cognitive.microsoft.com/luis/v2.0/apps/aac6c13c-63dc-444e-8f61-7ac4b97fa5ca?subscription-key=96429d5c0efc4cb692dddde6677c0f98&verbose=true&q=';

var HELP_MSG = 'Hi! 试着问问我有关班车或者天气的问题呗! \'火车站怎么走?\', \'明天天气如何?';
var END_MSG = '很高兴为您服务~';

// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
    console.log('%s listening to %s', server.name, server.url);
});

// Create connector and listen for messages
var connector = new builder.ChatConnector({
    appId: process.env.MICROSOFT_APP_ID,
    appPassword: process.env.MICROSOFT_APP_PASSWORD
});

server.post('/api/messages', connector.listen());

var instructions = '您好,请问需要什么帮助?';

// Create your bot with a function to receive messages from the user
var bot = new builder.UniversalBot(connector);

var recognizer = new builder.LuisRecognizer(model);
var dialog = new builder.IntentDialog({ recognizers: [recognizer] });
bot.dialog('/', dialog);
dialog.onDefault(builder.DialogAction.send(HELP_MSG));

bot.recognizer(recognizer);

bot.dialog('Help', function (session) {
    session.endDialog(HELP_MSG);
}).triggerAction({
    matches: 'Help'
});

function askStation(session, args, next) {
    if(session.dialogData.searchType === 'path') {
        next({response: session.message.text});
    } else {
        var entities = builder.EntityRecognizer.findAllEntities(args.intent.entities, '地点');
        // if(entities && entities.length) {
        //     console.log(JSON.stringify(entities[0]));
        //     next({response: entities[0].entity});
        // } else {
            session.dialogData.searchType = 'path';
            session.send('我识别到您正在查询路线,正在为您查询路线.请告诉我你所要去的完整地址.');
        // }
    }
}

var buildCard4Unknown = function (session) {
    var reply = new builder.Message().address(session.message.address);
    reply.attachmentLayout(builder.AttachmentLayout.carousel).addAttachment(new builder.HeroCard(session)
        .title('请告诉我们完整的地址,或者直接使用当前位置')
        .buttons([
            builder.CardAction.openUrl(session, process.env.LINDE_BUS_URL + 'useCurrent=true', '当前位置')
        ]));
};

function queryPath(session, args, next) {
    if(session.dialogData.searchEntity) {
        next({response: session.dialogData.searchEntity});
    } else {
        var entities = [{entity: args.response, type: "地点", startIndex: 0, endIndex: 2, score: 0.9999676}];
        //
        // if (args && args.intent && args.intent.entities) {
        // //init userData
        //     entities = builder.EntityRecognizer.findAllEntities(args.intent.entities, '地点');
        // }

        console.log(JSON.stringify(entities));

        amap.searchInAmap(entities).then(function (dests) {
            var options = [];
            dests.forEach(function (dest, index) {
                options.push(dest.name + ' [' + dest.adname + ']');
            });
            session.userData.possiblePoints = dests;
            if (options.length > 0) {
                session.dialogData.searchEntity = options[0];
                // builder.Prompts.choice(session, "为您列出了以下三个可能的路径,请选择", options);
                session.send('正在为您查询%s' , options[0]);
                next({response: session.dialogData.searchEntity});
            } else {
                // bot.send(buildCard4Unknown(session));
            }
        });
    }
}

function choiceExactDest(session, result) {
    var reply = new builder.Message().address(session.message.address);
    amap.getAmapCard(session, builder, result.response).then(function (amapCards) {
        reply.attachmentLayout(builder.AttachmentLayout.carousel).attachments(amapCards);
        session.send(reply);
        // session.endDialog(END_MSG);
        session.endDialog();
    });
}

bot.dialog('searchPath', [askStation, queryPath, choiceExactDest]).triggerAction({
    matches: '路线查询'
});

bot.dialog('searchPath4None', function (session) {
    session.endDialog(HELP_MSG);
}).triggerAction({
    matches: 'None'
});

bot.dialog('searchWeather', [function (session, args, next) {
    console.log('正在查询天气' + ', 并返回给' + JSON.stringify(session.message.address));

    if(!session.dialogData.searchType) {
        var reply = new builder.Message().address(session.message.address);
        reply.text('告诉我你所在的城市.我不会偷偷告诉别人的.');
        session.dialogData.searchType = 'weather';
        session.send(reply);
    } else {
        next({ response: session.message.text });
    }
},
function (session, results){
    console.log(JSON.stringify(results));
    var city = session.message.text;
    var reply = new builder.Message().address(session.message.address);
    // reply.text('正在为您查询 %s 的天气...', city);
    session.send(reply);
    // session.endDialog(END_MSG);
    session.endDialog();
}]).triggerAction({
    matches: '天气查询'
});

bot.dialog('backdoor', [function (session, args) {
    mongod.backdoorVarify().then(function (data) {
        var reply = new builder.Message().address(session.message.address);
        reply.text(data);
        session.send(reply);
    })

}]).triggerAction({
    matches: 'backdoor'
});

//
// bot.on('conversationUpdate', function (activity) {
//     // when user joins conversation, send instructions
//     if (activity.membersAdded) {
//         activity.membersAdded.forEach(function (identity) {
//             if (identity.id === activity.address.bot.id) {
//                 var reply = new builder.Message().address(activity.address).text(instructions);
//                 bot.send(reply);
//             }
//         });
//     }
// });
