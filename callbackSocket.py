"""
Sound figure WebSocket DAT callbacks

me - this DAT

dat - the WebSocket DAT
"""

import json

MIDI_OUT_CHOP = 'midiout1'

def midiOut():
	"""
	Return the TouchDesigner MIDI Out CHOP that forwards notes to Ableton.
	"""
	return op(MIDI_OUT_CHOP)

def midiVelocity(value):
	"""
	Convert the webpage's 0-1 velocity into a standard MIDI velocity.
	"""
	return max(1, min(127, int(round(float(value or 0.75) * 127))))

def onConnect(dat: websocketDAT):
	"""
	Called when a WebSocket connection is established.
	"""
	print('Sound figures WebSocket connected:', dat.path)
	return

def onDisconnect(dat: websocketDAT):
	"""
	Called when a WebSocket connection is disconnected.
	"""
	midiOutChop = midiOut()
	if midiOutChop is not None:
		midiOutChop.par.reset.pulse()
	print('Sound figures WebSocket disconnected:', dat.path)
	return

def onReceiveText(dat: websocketDAT, rowIndex: int, message: str):
	"""
	Called when a text frame message is received. Only text frame messages 
	will be handled in this function.
	
	Args:
		dat: The DAT that received a message
		rowIndex: The row number the message was placed into
		message: A unicode representation of the text
	"""
	try:
		data = json.loads(message)
	except Exception as err:
		print('Sound figures WebSocket invalid JSON:', err)
		print(message)
		return

	messageType = data.get('type')
	print('Sound figures WebSocket message:', messageType, data)

	if messageType != 'puppet.control':
		return

	puppetId = data.get('puppetId')
	eventType = data.get('event')
	midiChannel = data.get('midiChannel')

	if eventType in ('note_on', 'note_off'):
		midiOutChop = midiOut()
		midiNote = data.get('midiNote')
		velocity = midiVelocity(data.get('velocity'))

		if midiOutChop is None:
			print('Missing MIDI Out CHOP:', MIDI_OUT_CHOP)
			return

		try:
			if eventType == 'note_on':
				midiOutChop.sendNoteOn(midiChannel, midiNote, velocity)
			else:
				midiOutChop.sendNoteOff(midiChannel, midiNote, 0)
		except Exception as err:
			print('MIDI send failed:', err)
			return

		print(
			'Sound figure note:',
			'figure', puppetId,
			'channel', midiChannel,
			eventType,
			'note', midiNote,
			'velocity', velocity
		)
	elif eventType == 'parameter':
		print(
			'Sound figure parameter:',
			'figure', puppetId,
			'channel', midiChannel,
			data.get('parameter'),
			data.get('value')
		)
	elif eventType == 'motion':
		print('Sound figure motion:', 'figure', puppetId, 'x', data.get('x'), 'y', data.get('y'))
	elif eventType == 'energy':
		print('Sound figure energy:', 'figure', puppetId, 'active', data.get('active'))

	return


def onReceiveBinary(dat: websocketDAT, contents: bytes):
	"""
	Called when a binary frame message is received. Only binary frame 
	messages will be handled in this function.
	
	Args:
		dat: The DAT that received a message
		contents: A byte array of the message contents
	"""
	return

def onReceivePing(dat: websocketDAT, contents: bytes):
	"""
	Called when a ping message is received. Only ping messages will be 
	handled in this function.
	
	Args:
		dat: The DAT that received a message
		contents: A byte array of the message contents
	"""
	dat.sendPong(contents) # send a reply with same message
	return

def onReceivePong(dat: websocketDAT, contents: bytes):
	"""
	Called when a pong message is received. Only pong messages will be 
	handled in this function.
	
	Args:
		dat: The DAT that received a message
		contents: A byte array of the message content
	"""
	return

def onMonitorMessage(dat: websocketDAT, message: str):
	"""
	Called to monitor the websocket status messages.
	
	Args:
		dat: The DAT that received a message
		message: A unicode representation of the message
	"""
	print('Sound figures WebSocket monitor:', message)
	return
