require('dotenv').config();
const fs = require('fs');
const fsPromises = fs.promises;
const fileName = './events.json';
const Event = require('./event');

const TelegramBot = require('node-telegram-bot-api');

const token = process.env.TOKEN;
const admins = process.env.ADMINS.split(' ');

const dateOptions = {weekday: 'short', month: 'short', day: 'numeric'};
const timeOptions = {hour: "2-digit", minute: "2-digit", hour12: false};

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
                '❌ Error! Event not saved',
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

const validateUrl = (string) => {
  return /^(?:(?:(?:https?|ftp):)?\/\/)(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)(?:\.(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)*(?:\.(?:[a-z\u00a1-\uffff]{2,})))(?::\d{2,5})?(?:[/?#]\S*)?$/i.test(string);
}

const createDateTime = (date, time) => {
    d = date.split('/');
    t = time.split(':');
    return new Date('20'+d[2], d[1]-1, d[0], t[0],t[1]);
}

const getEventsInfo = async () => {
    let eventsText = '';
    
    await events.forEach(async (ev, i) => {
        const dateTime = new Date(ev.dateTime);
        
        eventsText += `<blockquote expandable>`;
        eventsText += `<b>&#128315;${ev.name.toUpperCase()}&#128315;</b>\n&#128197; ${dateTime.toLocaleDateString("en-US", dateOptions).split(",").join("")} ${dateTime.toLocaleTimeString("en-US", timeOptions)}\n📍 <b>${ev.place}</b> <i>(${ev.address})</i>`;
        // Retrieve attendees
        if(ev.attendees.length){
            // eventsText += `\nAttendees:`;
            for (const at of ev.attendees) {
                eventsText += `\n<i><a href="t.me/${at.username}">${at.first_name}</a></i>`;
            }
        }
        if(ev.price > 0 && ev.paymentLink.length > 0){
            eventsText += `\n\n<b><a href="${ev.paymentLink}">Click here to donate ${ev.price}€</a></b>`;
        } else if(ev.price > 0){
            eventsText += `\n&#127903; ${ev.price}€`;
        }
        eventsText += `</blockquote>`;
    });
    return eventsText;
}

const createEventsKeyboard = async (action) => {
    let keyboard = [];


    events.forEach((ev, i) => {
        const dateTime = new Date(ev.dateTime);
        const formattedDate = dateTime.toLocaleDateString("en-US", dateOptions);
        const formattedTime = dateTime.toLocaleTimeString("en-US", timeOptions);

        keyboard.push([{
            text: `${ev.name} - ${ev.place} | 📅 ${formattedDate} ${formattedTime}`,
            callback_data: JSON.stringify({ action: action, eventId: String(ev.id) }),
        }]);
    });

    // Return the custom keyboard
    return {
        reply_markup: JSON.stringify({
            inline_keyboard: keyboard,
            resize_keyboard: true,
            one_time_keyboard: true,
        }),
        parse_mode: 'HTML',
        disable_web_page_preview: true
    };
};

// Created instance of TelegramBot
const bot = new TelegramBot(token, {
    polling: true
});

const answerCallbacks = {};

// Listen for generic messages and trigger answer callbacks
bot.on('message', (msg) => {
    const callback = answerCallbacks[msg.chat.id];
    if (callback) {
        delete answerCallbacks[msg.chat.id];
        callback(msg);
    }
});

// Helper to ask a question and wait for valid input with validation logic
async function askValidated(chatId, question, validateFn, errorMessage) {
    while (true) {
        const answer = await askQuestion(chatId, question);
        if (validateFn(answer)) return answer;
        await bot.sendMessage(chatId, errorMessage);
    }
}

// Helper to ask a question and return the raw text
function askQuestion(chatId, question) {
    return new Promise((resolve) => {
        bot.sendMessage(chatId, question).then(() => {
            answerCallbacks[chatId] = (msg) => resolve(msg.text.trim());
        });
    });
}

// /create command
bot.onText(/\/create/, async (msg) => {
    const chatId = msg.chat.id;

    if (!isAdmin(msg.from.id)) {
        bot.sendMessage(chatId, "Admins only!");
        return;
    }

    await loadEvents();

    try {
        const name = await askValidated(chatId, "Event name?", text => text.length > 0, "Name cannot be empty.");

        const date = await askValidated(
            chatId,
            "Event date? (dd/mm/yy)",
            (text) => validateDate(text) && isFutureDate(text, false),
            "⚠️ Invalid or past date. Use dd/mm/yy format."
        );

        const time = await askValidated(
            chatId,
            "Event time? (hh:mm military time)",
            validateTime,
            "⚠️ Invalid time. Use hh:mm format (24-hour)."
        );

        const place = await askValidated(chatId, "Event place?", text => text.length > 0, "Place cannot be empty.");
        const address = await askValidated(chatId, "Address details?", text => text.length > 0, "Address cannot be empty.");

        const maxAttendees = await askValidated(
            chatId,
            "Maximum number of attendees? Write 0 if there's no limit",
            text => !isNaN(parseInt(text)),
            "⚠️ Invalid number for attendees."
        );

        const price = await askValidated(
            chatId,
            "Event price? Write 0 if event is free",
            text => !isNaN(parseFloat(text)),
            "⚠️ Invalid number for price."
        );

        const paymentLink = await askValidated(
            chatId,
            "Payment link?",
            text => validateUrl(text),
            "⚠️ Invalid URL."
        );

        const dateTime = createDateTime(date, time);

        const newEvent = new Event(msg.from);
        newEvent.name = name;
        newEvent.dateTime = dateTime;
        newEvent.place = place;
        newEvent.address = address;
        newEvent.maxAttendees = parseInt(maxAttendees);
        newEvent.price = parseFloat(price);
        newEvent.paymentLink = paymentLink;

        events.push(newEvent);
        await storeEvents(events);

        await bot.sendMessage(chatId, "✅ Event has been successfully created!");

    } catch (error) {
        console.error("Error during event creation:", error);
        bot.sendMessage(chatId, "❌ Something went wrong while creating the event.");
    }
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

    keyboard = await createEventsKeyboard('update');

    bot.sendMessage(
        chatId,
        'Which event do you want to <b>update</b>?\n\n' + eventsInfo,
        keyboard
    );
});

const updateEvent = async (cb, eventId) => {
    await loadEvents();
    const chatId = cb.message.chat.id;
    const index = events.findIndex((ev) => ev.id == eventId);
    if (index === -1) {
        await bot.sendMessage(chatId, "❌ Event not found.");
        return;
    }

    const event = events[index];
    const prevDate = new Date(event.dateTime);

    try {
        const name = await askValidated(
            chatId,
            `New event name? (currently: ${event.name})`,
            text => text.length > 0,
            "⚠️ Name cannot be empty."
        );

        const date = await askValidated(
            chatId,
            `New event date? (currently: ${twoDigits(prevDate.getDate())}/${twoDigits(prevDate.getMonth() + 1)}/${twoDigits(String(prevDate.getFullYear()))})`,
            text => validateDate(text) && isFutureDate(text, false),
            "⚠️ Invalid or past date. Use dd/mm/yy format."
        );

        const time = await askValidated(
            chatId,
            `New event time? (currently: ${twoDigits(prevDate.getHours())}:${twoDigits(prevDate.getMinutes())})`,
            validateTime,
            "⚠️ Invalid time. Use hh:mm format (24-hour)."
        );

        const place = await askValidated(
            chatId,
            `New event place? (currently: ${event.place})`,
            text => text.length > 0,
            "⚠️ Place cannot be empty."
        );

        const address = await askValidated(
            chatId,
            `New address details? (currently: ${event.address})`,
            text => text.length > 0,
            "⚠️ Address cannot be empty."
        );

        const price = await askValidated(
            chatId,
            `New event price? (currently: ${event.price})€`,
            text => !isNaN(parseFloat(text)),
            "⚠️ Invalid number for price."
        );

        const maxAttendees = await askValidated(
            chatId,
            `New maximum number of attendees? (currently: ${event.maxAttendees})`,
            text => !isNaN(parseInt(text)),
            "⚠️ Invalid number for attendees."
        );

        const paymentLink = await askValidated(
            chatId,
            `New payment link? (currently: ${event.paymentLink || "none"})`,
            text => validateUrl(text),
            "⚠️ Invalid URL format."
        );

        const dateTime = createDateTime(date, time);

        // Update the event
        event.name = name;
        event.dateTime = dateTime;
        event.place = place;
        event.address = address;
        event.price = parseFloat(price);
        event.maxAttendees = parseInt(maxAttendees);
        event.paymentLink = paymentLink;

        await storeEvents(events);
        await bot.sendMessage(chatId, "✅ Event has been successfully updated!");

    } catch (err) {
        console.error("Update failed:", err);
        await bot.sendMessage(chatId, "❌ An error occurred while updating the event.");
    }
};

bot.onText(/\/join/, async (msg, event) => {
    await loadEvents();
    chatId = msg.chat.id;
    eventsInfo = await getEventsInfo();

    if(!eventsInfo.length)
        return noEvents();

    keyboard = await createEventsKeyboard('join');

    bot.sendMessage(
        chatId,
        'Which event do you want to <b>join</b>?\n\n' + eventsInfo,
        keyboard
    );
});

const joinEvent = async (cb, eventId) => {
    const chatId = cb.message.chat.id;
    await loadEvents();

    const index = await events.findIndex((ev) => ev.id == eventId);
    const event = events[index];
   

    // Check event date
    if (!isFutureDate(event.dateTime)) {
        return bot.sendMessage(chatId, "❌ This event has already ended.");
    }

    // Check max attendees
    if (event.maxAttendees > 0 && event.attendees.length >= event.maxAttendees) {
        return bot.sendMessage(chatId, "❌ Sorry, this event is full.");
    }

    // Check if already joined
    const alreadyJoined = event.attendees.some((at) => at.id === cb.from.id);
    if (alreadyJoined) {
        return bot.sendMessage(chatId, "⚠️ You have already joined this event.");
    }

    // Ask about donation, but allow joining regardless
    if (event.paymentLink) {
        await bot.sendMessage(
            chatId,
            `Please consider donating if you haven't already 🙏\n\n💳 <b><a href="${event.paymentLink}">Click here to donate ${event.price}€</a></b>\n\nHave you already donated? (yes/no)`,
            { parse_mode: 'HTML', disable_web_page_preview: false }
        );

        answerCallbacks[chatId] = async function handleDonationResponse(msg) {
            const answer = msg.text.trim().toLowerCase();
            let donated = false;

            if (answer === "yes") donated = true;
            else if (answer !== "no") {
                await bot.sendMessage(chatId, "Please answer with 'yes' or 'no'.");
                answerCallbacks[chatId] = handleDonationResponse;
                return;
            }

            event.attendees.push({
                ...cb.from,
                donated
            });

            await storeEvents(events);
            await bot.sendMessage(chatId, "✅ You have successfully joined the event!");
        };
    } else {
        // No payment link, just join directly
        event.attendees.push({
            ...cb.from,
            donated: false // no payment link, assume false
        });

        await storeEvents(events);
        return bot.sendMessage(chatId, "✅ You have successfully joined the event!");
    }
};

bot.onText(/\/leave/, async (msg, event) => {
    await loadEvents();
    chatId = msg.chat.id;
    eventsInfo = await getEventsInfo();

    if(!eventsInfo.length)
        return noMatches();

    keyboard = await createEventsKeyboard('leave');

    bot.sendMessage(
        chatId,
        'Which event do you want to <b>leave</b>?\n\n' + eventsInfo,
        keyboard
    );
});

const leaveEvent = async (cb, eventId) => {
    const chatId = cb.message.chat.id;
    await loadEvents();
    
    const event = events.find((ev) => ev.id == eventId);  // Use `find` for direct match

    // If the event does not exist
    if (!event) {
        return bot.sendMessage(chatId, "⚠️ Event not found.");
    }

    // If there are no attendees
    if (event.attendees.length === 0) {
        return bot.sendMessage(chatId, "⚠️ There are no attendees for this event.");
    }

    // Check if the user is already enrolled
    const attendeeIndex = event.attendees.findIndex((at) => at.id === cb.from.id);

    if (attendeeIndex === -1) {
        return bot.sendMessage(chatId, "⚠️ You are not enrolled in this event.");
    }

    // Remove the user from the attendees list
    event.attendees.splice(attendeeIndex, 1);

    // Store the updated event
    await storeEvents(events);

    // Inform the user
    bot.sendMessage(chatId, "You have successfully left the event.");
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
        'Which event do you want to <b>delete</b>?\n\n' + eventsInfo,
        keyboard
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

    if(isAdmin(msg.from.id)){
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