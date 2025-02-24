const { randomUUID } = require('crypto'); 

const event =  function (owner) {
	this.id = randomUUID().slice(-8);
	this.name = '';
	this.dateTime = null;
	this.place = '';
	this.address = '';
	this.attendees = [];
	this.maxAttendees = 0;
	this.price = 0;
	this.payed = false;
	this.owner = owner;
}

module.exports = event;