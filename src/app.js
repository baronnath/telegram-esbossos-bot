require('dotenv').config();
const fs = require('fs');
const fsPromises = fs.promises;
const fileName = './events.json';
const Event = require('./event');

const TelegramBot = require('node-telegram-bot-api');

const token = process.env.TOKEN;
const admins = process.env.ADMINS.split(' ');
let events = [];
let chatId;

const loadEvents = async (owner = false) => {
    await fsPromises.readFile(fileName)
        .then(async (data) => {
            events = JSON.parse(data);
            if(events.lenght){
                if(owner) 
                    events = await events.filter((ev) => {
                        return ev.owner.id == owner;
                    });
                await events.sort((a,b) => new Date(a.dateTime) - new Date(b.dateTime));
            }
        })
        .catch((err) => console.error('Failed to read file', err));
}

const storeEvents = async (events) => {
    // Clear old events
    events = await events.filter((ev) => {
        return isFutureDate(ev.dateTime); 
    });
    await fsPromises.writeFile(fileName, JSON.stringify(events))
        .catch((err) => {
            bot.sendMessage(
                chatId,
                'Error! Event not saved',
            );
        });  
}

const validateDate = (string) => {
    let valid = true;
    var re = new RegExp(/([0-9]|[12][0-9]|3[01])\/([0-9]{2})\/([0-9]{2})/gm);
    if (!re.test(string))
        valid = false;
    return valid;
}

// Check if date is today or later in the future
const isFutureDate = (date, object = true) => {
    if(object)
        newDate = new Date(date);
    else {
        d = date.split('/');
        newDate = new Date('20'+d[2], d[1]-1, d[0]);
    }
    return new Date(newDate.toDateString()) >= new Date(new Date().toDateString());
}

const validateTime = (string) => {
    let valid = true;
    var re = new RegExp(/^([01]\d|2[0-3]):?([0-5]\d)$/gm);
    if (!re.test(string))
        valid = false;
    return valid;
}

const createDateTime = (date, time) => {
    d = date.split('/');
    t = time.split(':');
    return new Date('20'+d[2], d[1]-1, d[0], t[0],t[1]);
}

const getEventsInfo = async () => {
    let eventsText = '';
    const dateOptions = {weekday: 'short', year: '2-digit', month: 'short', day: 'numeric'};
    const timeOptions = {hour: "numeric", minute: "numeric", hour12: false};
    await events.forEach(async (ev, i) => {
        const dateTime = new Date(ev.dateTime);
        if(i != 0)
            eventsText += `\n\n`;
        eventsText += `<b>&#128315; ${ev.name.toUpperCase()}&#128315;</b>\n&#128197; ${dateTime.toLocaleDateString("en-US", dateOptions).split(",").join("")} ${dateTime.toLocaleTimeString("en-US", timeOptions)}\n&#128204; <b>${ev.place}</b> (${ev.address})\n&#127903; ${ev.price}€`;
        // Retrieve attendees
        if(ev.attendees.length){
            // eventsText += `\nAttendees:`;
            await ev.attendees.forEach((at) => eventsText += `\n<b><a href="t.me/${at.username}">${at.first_name}</a></b>`);
        }
    });
    return eventsText;
}

const createEventsKeyboard = async (action) => {
    let inlineKeyboard = [];
    const options = {day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'}
    await events.map((ev, i) => {
        const dateTime = new Date(ev.dateTime);
        inlineKeyboard.push({
            text: `#${i+1} ${dateTime.toLocaleDateString("es-ES", options)} ${ev.place}`,
            callback_data: JSON.stringify({ action: action, eventId: String(ev.id)})
        });
    });
    return inlineKeyboard;
}

// Created instance of TelegramBot
const bot = new TelegramBot(token, {
    polling: true
});

let answerCallbacks = {};
bot.on('message', function (msg) {
    var callback = answerCallbacks[msg.chat.id];
    if (callback) {
        delete answerCallbacks[msg.chat.id];
        return callback(msg);
    }
});

// Listener (handler) for telegram's /bookmark event
bot.onText(/\/create/, async (msg, event) => {
    chatId = msg.chat.id;

    if(!isAdmin(msg.from.id)){
        bot.sendMessage(chatId, "Admins only!");
        return;
    }

    await loadEvents();

    // Retrieve date, time and place
    bot.sendMessage(chatId, "Event name?").then(function () {
        answerCallbacks[chatId] = function (answer) {
            let name = answer.text;
            bot.sendMessage(chatId, "Event date? (dd/mm/yy)").then(function () {
                answerCallbacks[chatId] = function (answer) {
                    let date = answer.text;
                    if(validateDate(date) && isFutureDate(date, false))
                        bot.sendMessage(chatId, "Event time? (hh:mm military time)").then(function () {
                            answerCallbacks[chatId] = function (answer) {
                                let time = answer.text;
                                if(validateTime(time)){
                                    bot.sendMessage(chatId, "Event place?").then(function () {
                                        answerCallbacks[chatId] = function (answer) {
                                            let place = answer.text;
                                            bot.sendMessage(chatId, "Address details?").then(function () {
                                                answerCallbacks[chatId] = function (answer) {
                                                    let address = answer.text;
                                                    bot.sendMessage(chatId, "Event price? Write 0 if event is free").then(function () {
                                                        answerCallbacks[chatId] = function (answer) {
                                                            let price = answer.text;
                                                            if(!isNaN(price)){
                                                                bot.sendMessage(chatId, "Maximum number of attendees? Write 0 if there's no limit").then(function () {
                                                                    answerCallbacks[chatId] = function (answer) {
                                                                        let maxAttendees = answer.text;
                                                                        if(!isNaN(maxAttendees)){
                                                                            let dateTime = createDateTime(date, time);
                                                                            let newEvent = new Event(msg.from);
                                                                            newEvent.dateTime = dateTime;
                                                                            newEvent.name = name;
                                                                            newEvent.place = place;
                                                                            newEvent.address = address;
                                                                            newEvent.price = price;
                                                                            newEvent.maxAttendees = maxAttendees;
                                                                            events.push(newEvent);
                                                                            console.log('events:', events);
                                                                            storeEvents(events)
                                                                                .then(() => bot.sendMessage(
                                                                                    chatId,
                                                                                    'Event has been successfully created!',
                                                                                )).catch(error => 
                                                                                  console.error(error)
                                                                                );
                                                                        }
                                                                        else
                                                                            bot.sendMessage(chatId, "Invalid number!");
                                                                    }
                                                                });

                                                            }
                                                            else
                                                                bot.sendMessage(chatId, "Invalid number!");
                                                        }
                                                    });
                                                }
                                            });
                                        }
                                    });
                                }
                                else
                                    bot.sendMessage(chatId, "Invalid time!");
                            }
                        });
                    else
                        bot.sendMessage(chatId, "Invalid date!");
                }
            });
        }
    });

});

// Listener (handler) for telegram's /label event
bot.onText(/\/list/, async (msg, event) => {
    await loadEvents();
    chatId = msg.chat.id;
    eventsInfo = await getEventsInfo();
    if(!eventsInfo.length)
        return noMatches();
    bot.sendMessage(chatId, eventsInfo, {parse_mode: 'HTML', disable_web_page_preview: true});
});

bot.onText(/\/update/, async (msg, event) => {
    chatId = msg.chat.id;

    if(!isAdmin(msg.from.id)){
        bot.sendMessage(chatId, "Admins only!");
        return;
    }

    await loadEvents();
    eventsInfo = await getEventsInfo();

    if(!eventsInfo.length)
        return noMatches();

    inlineKeyboard = await createEventsKeyboard('update');

    bot.sendMessage(
        chatId,
        'Which event do you want to <b>update</b>?\n\n' + eventsInfo,
        {
            reply_markup: JSON.stringify({
                inline_keyboard: [inlineKeyboard],
                resize_keyboard: true,
                one_time_keyboard: true,
            }),
            parse_mode: 'HTML'
        }
    );
});

const updateEvent = async (cb, eventId) => {
    await loadEvents();
    const chatId = cb.message.chat.id;
    const index = await events.findIndex((ev) => ev.id == eventId);


    // Retrieve date, time and place
    const prevDate = new Date(events[index].dateTime);
    bot.sendMessage(chatId, `New event name? Currently ${events[index].name}`).then(function () {
        answerCallbacks[chatId] = function (answer) {
            let name = answer.text;
            bot.sendMessage(chatId, `New event date? Currently ${twoDigits(prevDate.getDate())}/${twoDigits(prevDate.getMonth() + 1)}/${twoDigits(String(prevDate.getFullYear()))}`).then(function () {
                answerCallbacks[chatId] = function (answer) {
                    let date = answer.text;
                    if(validateDate(date))
                        bot.sendMessage(chatId, `New event time?  Currently ${twoDigits(prevDate.getHours())}:${twoDigits(prevDate.getMinutes())}`).then(function () {
                            answerCallbacks[chatId] = function (answer) {
                                let time = answer.text;
                                if(validateTime(time)){
                                    bot.sendMessage(chatId, `New event place? Currently ${events[index].place}`).then(function () {
                                        answerCallbacks[chatId] = async function (answer) {
                                            let place = answer.text;
                                            bot.sendMessage(chatId, `New address details? Currently ${events[index].address}`).then(function () {
                                                answerCallbacks[chatId] = function (answer) {
                                                    let address = answer.text;
                                                    bot.sendMessage(chatId, `New event price?? Currently ${events[index].price}`).then(function () {
                                                        answerCallbacks[chatId] = function (answer) {
                                                            let price = answer.text;
                                                            if(!isNaN(price)){
                                                                bot.sendMessage(chatId, "Maximum number of attendees? Write 0 if there's no limit").then(function () {
                                                                    answerCallbacks[chatId] = function (answer) {
                                                                        let maxAttendees = answer.text;
                                                                        if(!isNaN(maxAttendees)){
                                                                            let dateTime = createDateTime(date, time);

                                                                            events[index].dateTime = dateTime;
                                                                            events[index].name = name;
                                                                            events[index].place = place;
                                                                            events[index].address = address;
                                                                            events[index].price = price;
                                                                            events[index].maxAttendees = maxAttendees;
                                                                            
                                                                            storeEvents(events)
                                                                                .then(() => bot.sendMessage(
                                                                                    chatId,
                                                                                    'Event has been successfully updated!',
                                                                                ));
                                                                        }
                                                                        else
                                                                            bot.sendMessage(chatId, "Invalid number!");
                                                                    }
                                                                });
                                                            }
                                                            else
                                                                bot.sendMessage(chatId, "Invalid number!");
                                                        }
                                                    });
                                                }
                                            });
                                        }
                                    });
                                }
                                else
                                    bot.sendMessage(chatId, "Invalid time!");
                            }
                        });
                    else
                        bot.sendMessage(chatId, "Invalid date!");
                }
            });
        }
    });
};    

bot.onText(/\/join/, async (msg, event) => {
    await loadEvents();
    chatId = msg.chat.id;
    eventsInfo = await getEventsInfo();

    if(!eventsInfo.length)
        return noEvents();

    inlineKeyboard = await createEventsKeyboard('join');

    bot.sendMessage(
        chatId,
        'Which event do you want to <b>join</b>?\n\n' + eventsInfo,
        {
            reply_markup: JSON.stringify({
                inline_keyboard: [inlineKeyboard],
                resize_keyboard: true,
                one_time_keyboard: true,
            }),
            parse_mode: 'HTML'
        }
    );
});

const joinEvent = async (cb, eventId) => {
    const chatId = cb.message.chat.id;
    await loadEvents();

    const index = await events.findIndex((ev) => ev.id == eventId);
   
    // Check event date
    if(!isFutureDate(events[index].dateTime))
        return bot.sendMessage(chatId, "Sorry this event has ended");

    // Check number of attendees
    if(events[index].maxAttendees > 0 && events[index].attendees.length >= events[index].maxAttendees)
        return bot.sendMessage(chatId, "Event is full!");

    // Check user is not already enrolled
    if(events[index].attendees.length) {
        let valid = await events[index].attendees.every((at) => {
            return at.id != cb.from.id;
        });
        if(!valid)
            return bot.sendMessage(chatId, "You are already enrolled!");
    }

    // Add player
    events[index].attendees.push(cb.from);
    storeEvents(events)
        .then(() => bot.sendMessage(
            chatId,
            'You joined the event successfully!',
        ));
};

bot.onText(/\/leave/, async (msg, event) => {
    await loadEvents();
    chatId = msg.chat.id;
    eventsInfo = await getEventsInfo();

    if(!eventsInfo.length)
        return noMatches();

    inlineKeyboard = await createEventsKeyboard('leave');

    bot.sendMessage(
        chatId,
        'Which event do you want to <b>leave</b>?\n\n' + eventsInfo,
        {
            reply_markup: JSON.stringify({
                inline_keyboard: [inlineKeyboard],
                resize_keyboard: true,
                one_time_keyboard: true,
            }),
            parse_mode: 'HTML'
        }
    );
});

const leaveEvent = async (cb, eventId) => {
    const chatId = cb.message.chat.id;
    await loadEvents();
    const index = await events.findIndex((ev) => ev.id == eventId);
   
    // Check number of players
    if(!events[index].attendees.length)
        return bot.sendMessage(chatId, "There are no attendees");
    
    let valid = await events[index].attendees.find((at) => at.id == cb.from.id);

    if(valid == undefined)
        return bot.sendMessage(chatId, "You are not enrolled on this event!");

    let filteredAttendees = await events[index].attendees.filter((at) => {
        return at.id != cb.from.id;
    });

    // Add player
    events[index].attendees = filteredAttendees;
    storeEvents(events)
        .then(() => bot.sendMessage(
            chatId,
            'You left the event',
        ));
};

bot.onText(/\/delete/, async (msg, event) => {
    chatId = msg.chat.id;

    if(!isAdmin(msg.from.id)){
        bot.sendMessage(chatId, "Admins only!");
        return;
    }

    await loadEvents(msg.from.id);
    eventsInfo = await getEventsInfo();

    if(!eventsInfo.length)
        return noMatches();

    inlineKeyboard = await createEventsKeyboard('delete');

    bot.sendMessage(
        chatId,
        'Which event do you want to <b>delete</b>? <em>Only events you own</em>\n\n' + eventsInfo,
        {
            reply_markup: JSON.stringify({
                inline_keyboard: [inlineKeyboard],
                resize_keyboard: true,
                one_time_keyboard: true,
            }),
            parse_mode: 'HTML'
        }
    );
});

const deleteEvent = async (cb, eventId) => {
    const chatId = cb.message.chat.id;
    await loadEvents();

    events = events.filter((ev) => {
        return ev.id != eventId
    });
    storeEvents(events)
        .then(() => bot.sendMessage(
            chatId,
            'Event deleted',
        ));
};

bot.onText(/\/clean/, async (msg, event) => {
    chatId = msg.chat.id;

    if(!isAdmin(msg.from.id)){
        bot.sendMessage(chatId, "Admins only!");
        return;
    }

    await loadEvents(msg.from.id);
    storeEvents(events)
        .then(() => bot.sendMessage(
            chatId,
            'Events cleaned',
        ));
});

// Listener (handler) for callback data from /join command
bot.on('callback_query', (callbackQuery) => {
    const data = JSON.parse(callbackQuery.data);
    console.log('DATA: ',callbackQuery);

    switch (data.action) {
        case 'join':
            joinEvent(callbackQuery, data.eventId);
            break;
        case 'update':
            updateEvent(callbackQuery, data.eventId);
            break;
        case 'leave':
            leaveEvent(callbackQuery, data.eventId);
            break;
        case 'delete':
            deleteEvent(callbackQuery, data.eventId);
            break;
        default:
            bot.sendMessage(chatId, "Action not recognized");
    }
});

const twoDigits = (string) => {
    return ("0" + string).slice(-2);
}

const noMatches = () => {
    bot.sendMessage(chatId, 'There are no events', {parse_mode: 'HTML'});
}

const isAdmin = (uid) => {
    return admins.find((admin) => uid == admin);
}

// Listener (handler) for telegram's /start event
// This event happened when you start the conversation with both by the very first time
// Provide the list of available commands
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;

    let message = `Welcome to <b>Esbossos del Ram</b>\nAvailable commands:
        /list - See all coming events
        /join - Join an event
        /leave - Leave an event you joined`;

    if(isAdmin){
        message += `\n<i>Only admin commands</i>
        /create - Create an event
        /update - Update an event information
        /delete - Delete an event
        /clean - Delete all past events`;
    }

    bot.sendMessage(
        chatId,
        message, {
            parse_mode: 'HTML',
        }
    );
});

bot.on("polling_error", console.log);