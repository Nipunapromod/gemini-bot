const { Storage } = require('megajs');

let storageInstance = null;

async function getMegaStorage() {
  if (storageInstance && storageInstance.ready) return storageInstance;

  storageInstance = new Storage({
    email: process.env.MEGA_EMAIL,
    password: process.env.MEGA_PASSWORD
  });

  return await storageInstance.ready;
}

async function uploadBufferToMega(filename, buffer) {
  try {
    const storage = await getMegaStorage();
    const file = await storage.upload({ name: filename }, buffer).complete;
    const downloadLink = await file.link();
    return { success: true, link: downloadLink };
  } catch (err) {
    console.error('Mega Upload Error:', err);
    return { success: false, error: err.message };
  }
}

async function listMegaFiles() {
  try {
    const storage = await getMegaStorage();
    const files = [];
    storage.files.forEach(file => {
      if (!file.directory) files.push({ name: file.name, size: file.size });
    });
    return { success: true, files };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { uploadBufferToMega, listMegaFiles };
