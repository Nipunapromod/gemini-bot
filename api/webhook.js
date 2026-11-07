const axios = require('axios');
const { processUserMessage, handleIncomingMediaOrDocument } = require('../lib/ai');

module.exports = async (req, res) => {
  // 1. Meta Webhook Verification (GET)
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Verification failed');
  }

  // 2. Incoming Messages Handler (POST)
  if (req.method === 'POST') {
    try {
      const body = req.body;
      const entry = body.entry?.[0];
      const change = entry?.changes?.[0]?.value;
      const message = change?.messages?.[0];

      if (message) {
        const senderPhone = message.from;
        let result = null;

        // Route to Document/Media or Text/Interactive handlers
        if (message.type === 'document' || message.type === 'image' || message.type === 'video') {
          result = await handleIncomingMediaOrDocument(message);
        } else if (message.type === 'text' || message.type === 'interactive') {
          let userText = '';
          let callbackData = null;

          if (message.type === 'text') {
            userText = message.text.body;
          } else if (message.interactive.type === 'button_reply') {
            callbackData = message.interactive.button_reply.id;
            userText = message.interactive.button_reply.title;
          } else if (message.interactive.type === 'list_reply') {
            callbackData = message.interactive.list_reply.id;
            userText = message.interactive.list_reply.title;
          }

          result = await processUserMessage(userText, callbackData);
        }

        if (result) {
          await sendWhatsAppResponse(senderPhone, result);
        }
      }

      return res.status(200).send('EVENT_RECEIVED');
    } catch (err) {
      console.error('Webhook Error:', err);
      return res.status(500).send('Internal Server Error');
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
};

async function sendWhatsAppResponse(to, result) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const url = `https://graph.facebook.com/v19.0/${phoneId}/messages`;

  let payload = { messaging_product: 'whatsapp', to: to };

  if (result.type === 'text') {
    payload.type = 'text';
    payload.text = { body: result.content };
  } else if (result.type === 'image') {
    payload.type = 'image';
    payload.image = { link: result.url, caption: result.caption };
  } else if (result.type === 'list') {
    payload.type = 'interactive';
    payload.interactive = {
      type: 'list',
      header: { type: 'text', text: result.headerText },
      body: { text: result.bodyText },
      footer: { type: 'text', text: 'Mastermind Bot ⚡' },
      action: { button: result.buttonText, sections: result.sections }
    };
  }

  await axios.post(url, payload, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
}
