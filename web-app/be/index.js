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
// ENDPOINT BARU UNTUK VERIFIKASI
app.post("/verify", async (req, res) => {
  // Input endpoint diubah untuk keamanan dan efisiensi
  const { documentId, publicKey: publicKeyString } = req.body;

  if (!documentId || !publicKeyString) {
    return res.status(400).send({ verify: false, error: "Document ID and Public Key are required." });
  }
  
  try {
    // 1. Ambil metadata dokumen dari Firestore
    const doc = await db.collection('documents').doc(documentId).get();

    if (!doc.exists) {
      return res.status(404).send({ verify: false, error: "Document not found" });
    }

    const { fileName, signature: storedSignature } = doc.data();
    
    // 2. Unduh file dari Supabase Storage untuk diverifikasi
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from('files')
      .download(fileName);

    if (downloadError) {
      throw new Error("Could not download file from storage for verification.");
    }

    const fileBuffer = Buffer.from(await fileBlob.arrayBuffer());

    // 3. Siapkan public key
    const publicKey = crypto.createPublicKey({
      key: Buffer.from(publicKeyString, "base64"),
      type: "spki",
      format: "der",
    });

    // 4. Verifikasi tanda tangan terhadap file yang diunduh
    const verify = crypto.createVerify("SHA256");
    verify.update(fileBuffer);
    verify.end();

    const result = verify.verify(publicKey, Buffer.from(storedSignature, "base64"));

    if (result) {
      // 5. Jika berhasil, dapatkan URL publik dari Supabase
      const { data: urlData } = supabase.storage.from('files').getPublicUrl(fileName);
      res.send({ fileName, signature: storedSignature, verify: true, fileURL: urlData.publicUrl });
    } else {
      res.send({ fileName, signature: storedSignature, verify: false, error: "Signature is not valid." });
    }
  } catch (error) {
    console.error("Error during verification:", error);
    res.status(500).send({ error: "An error occurred during verification. Check if the Public Key is correct." });
  }
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