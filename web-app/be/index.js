const express = require('express');
const app = express();
const port = 5000;
const crypto = require('crypto');
const multer = require("multer");
const { db } = require ('./config');
const { supabase } = require('./supabaseClient');

const upload = multer({ storage: multer.memoryStorage() });

// Middleware untuk CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // Izinkan lebih banyak metode
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
  next();
});

// Middleware untuk membaca JSON body (diperlukan untuk /verify)
app.use(express.json());

// =================================================================
// ENDPOINT UNTUK MEMBUAT KUNCI (Tidak Diubah)
// =================================================================
app.get('/KeyGen', (req, res) => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'der' },
      privateKeyEncoding: { type: 'pkcs8', format: 'der' },
    });
  
    db.collection('keyPairs')
      .add({ publicKey: publicKey.toString('base64'), privateKey: privateKey.toString('base64') })
      .then((docRef) => {
        res.send({ id: docRef.id, publicKey: publicKey.toString('base64'), privateKey: privateKey.toString('base64') });
      })
      .catch((error) => {
        console.error("Gagal menyimpan key pair:", error);
        res.status(500).send({ error: 'Failed to store key pair' });
      });
});

// =================================================================
// ENDPOINT BARU UNTUK MENANDATANGANI (Menggabungkan /upload dan /sign)
// =================================================================
app.post("/sign", upload.single("file"), (req, res) => {
  // 1. Dapatkan Kunci Privat dari body request (dikirim via FormData)
  const privateKeyString = req.body.privateKey;

  // 2. Dapatkan file yang diunggah dari middleware multer
  const uploadedFile = req.file;

  // 3. Validasi input 
  if (!uploadedFile) {
    return res.status(400).send({ error: "File tidak ditemukan. Pastikan Anda mengunggah file." });
  }
  if (!privateKeyString) {
    return res.status(400).send({ error: "Kunci privat tidak ditemukan." });
  }

  try {
    // 4. Proses Kunci Privat
    const privateKey = crypto.createPrivateKey({
      key: Buffer.from(privateKeyString, "base64"),
      type: "pkcs8",
      format: "der",
    });

    // 5. Buat Tanda Tangan dari buffer file
    const sign = crypto.createSign("SHA256");
    sign.update(uploadedFile.buffer);
    sign.end();
    const signature = sign.sign(privateKey).toString("base64");

    const fileName = uploadedFile.originalname;
    const fileBase64 = uploadedFile.buffer.toString("base64");

    // 6. Simpan file ke Firebase Storage
    const storageRef = storage.ref(`files/${fileName}`);
    storageRef.put(uploadedFile.buffer).then(() => {
        // 7. Jika upload berhasil, simpan metadata ke Firestore
        db.collection("documents")
          .add({
            fileName,
            signature,
            fileContent: fileBase64,
          })
          .then((docRef) => {
            console.log("File berhasil ditandatangani dan disimpan:", docRef.id);
            // Kirim kembali signature ke frontend sebagai konfirmasi
            res.send({ id: docRef.id, fileName, signature });
          })
          .catch((error) => {
            console.error("Gagal menyimpan dokumen ke Firestore:", error);
            res.status(500).send({ error: "Gagal menyimpan dokumen ke Firestore" });
          });
    }).catch(error => {
        console.error("Gagal mengunggah file ke Storage:", error);
        res.status(500).send({ error: "Gagal mengunggah file ke Storage" });
    });

  } catch (error) {
    // Tangkap error jika format kunci salah, dll.
    console.error("Terjadi error saat membuat signature:", error);
    res.status(500).send({ error: "Format kunci privat tidak valid atau terjadi kesalahan lain." });
  }
});

// =================================================================
// ENDPOINT UNTUK VERIFIKASI (Tidak Diubah, tapi lebih aman sekarang)
// =================================================================
app.post("/verify", (req, res) => {
  let { fileName, publicKey, signature } = req.body;
  
    publicKey = crypto.createPublicKey({
      key: Buffer.from(publicKey, "base64"),
      type: "spki",
      format: "der",
    });
  
    db.collection("documents")
      .where("fileName", "==", fileName)
      .get()
      .then((querySnapshot) => {
        if (querySnapshot.empty) {
          res.send({ verify: false, error: "Document not found" });
        } else {
          querySnapshot.forEach((doc) => {
            const storedSignature = doc.data().signature;
            const fileContentBase64 = doc.data().fileContent;
            const fileBuffer = Buffer.from(fileContentBase64, "base64");
  
            const verify = crypto.createVerify("SHA256");
            verify.update(fileBuffer);
            verify.end();
  
            try {
              const result = verify.verify(publicKey, Buffer.from(signature, "base64"));
  
              if (result) {
                const storageRef = storage.ref(`files/${fileName}`);
                storageRef
                  .getDownloadURL()
                  .then((url) => {
                    res.send({ fileName, signature, verify: true, fileURL: url });
                  })
                  .catch((error) => {
                    console.error("Failed to get file download URL:", error);
                    res.status(500).send({ error: "Failed to get file download URL" });
                  });
              } else {
                res.send({ fileName, signature, verify: false });
              }
            } catch (error) {
              console.error("Error during verification:", error);
              res.status(500).send({ error: "Error during verification" });
            }
          });
        }
      })
      .catch((error) => {
        console.error("Failed to verify document:", error);
        res.status(500).send({ error: "Failed to verify document" });
      });
});

// =================================================================
// ENDPOINT UNTUK MENGAMBIL DOKUMEN (Tidak Diubah)
// =================================================================
app.get('/documents/:id', (req, res) => {
  const documentId = req.params.id;
  
    db.collection('documents')
      .doc(documentId)
      .get()
      .then((doc) => {
        if (!doc.exists) {
          res.status(404).send({ error: 'Document not found' });
        } else {
          const attributes = doc.data();
          res.send(attributes);
        }
      })
      .catch((error) => {
        res.status(500).send({ error: 'Failed to fetch document' });
      });
});  

// =================================================================
// SERVER LISTENER
// =================================================================
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});