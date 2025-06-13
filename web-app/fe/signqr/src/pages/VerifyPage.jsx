// src/pages/VerifyPage.jsx

import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import { useParams, Link } from "react-router-dom";
import { FiFileText, FiShield, FiCheckCircle, FiXCircle, FiLoader, FiDownload, FiKey } from "react-icons/fi";
import { toast } from "react-hot-toast";

export default function VerifyPage() {
  const [document, setDocument] = useState(null);
  const [inputPublicKey, setInputPublicKey] = useState("");
  const [isLoading, setIsLoading] = useState(true); // Mulai dengan loading
  const [verificationResult, setVerificationResult] = useState(null);
  const { id } = useParams();
  
  // Ref untuk debounce
  const debounceTimeout = useRef(null);

  // Efek 1: Ambil data dokumen saat halaman dimuat
  useEffect(() => {
    async function getDataById() {
      if (!id) {
        setIsLoading(false);
        return;
      }
      try {
        const res = await axios.get(`http://localhost:5000/documents/${id}`);
        setDocument(res.data);
      } catch (err) {
        toast.error("Could not find a document with that ID.");
      } finally {
        setIsLoading(false);
      }
    }
    getDataById();
  }, [id]);

  // Efek 2: Picu verifikasi secara otomatis saat kunci publik dimasukkan
  useEffect(() => {
    // Hapus timeout sebelumnya jika ada
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }
    
    // Hanya jalankan jika kita punya dokumen dan kunci publik
    if (document && inputPublicKey.trim() !== "") {
      // Set timeout baru (debounce) untuk 1 detik
      debounceTimeout.current = setTimeout(() => {
        handleVerify();
      }, 1000); // Tunggu 1 detik setelah user berhenti mengetik
    }

    // Cleanup function untuk menghapus timeout saat komponen unmount
    return () => {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
    };
  }, [inputPublicKey, document]);


  // Fungsi untuk handle verifikasi
  async function handleVerify() {
    setIsLoading(true);
    setVerificationResult(null);

    try {
      const payload = {
        documentId: id, // Gunakan 'id' dari useParams()
        publicKey: inputPublicKey,
      };
      const res = await axios.post(`http://localhost:5000/verify`, payload);
      setVerificationResult(res.data);

      if (res.data.verify) {
        toast.success("Verification Successful! Downloading file...");
        // Picu download otomatis
        const link = document.createElement('a');
        link.href = res.data.fileURL;
        link.setAttribute('download', document.fileName || 'verified-file');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        toast.error(res.data.error || "Verification Failed. Invalid key or signature.");
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || "An unknown error occurred.";
      setVerificationResult({ verify: false, error: errorMessage });
      toast.error(`Error: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }


  // Tampilan saat loading data dokumen awal
  if (isLoading && !document) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-center text-text-muted">
        <FiLoader className="mr-4 h-8 w-8 animate-spin" />
        <span className="text-xl">Loading Document Data...</span>
      </div>
    );
  }

  // Tampilan jika dokumen tidak ditemukan
  if (!document) {
    return (
       <div className="flex min-h-[60vh] flex-col items-center justify-center text-center text-text-muted">
         <FiXCircle className="mb-4 h-16 w-16 text-red-500" />
         <h2 className="text-2xl font-bold text-text-light">Document Not Found</h2>
         <p>The link may be invalid or the document has been deleted.</p>
         <Link to="/sign" className="mt-6 rounded-lg bg-primary px-4 py-2 text-white hover:brightness-110">Go back to Sign Page</Link>
       </div>
    );
  }

  // Tampilan utama halaman verifikasi
  return (
    <div className="flex flex-col items-center justify-center p-4">
      <div className="mb-8 text-center">
        <h1 className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-4xl font-bold text-transparent md:text-5xl">
          Document Verification
        </h1>
        <p className="mt-2 flex items-center justify-center gap-2 text-text-muted">
          <FiFileText /> Verifying file: <strong>{document.fileName}</strong>
        </p>
      </div>
      
      <div className="w-full max-w-2xl rounded-2xl border border-border-color bg-card-bg p-8 shadow-2xl backdrop-blur-lg">
        <div className="flex flex-col gap-6">
          {/* Info Signature (read-only) */}
          <div>
            <h2 className="mb-2 text-lg font-semibold text-secondary">Document Signature</h2>
            <textarea rows="4" className="w-full rounded-lg bg-dark-bg p-3 text-sm text-text-muted" value={document.signature} readOnly />
          </div>

          {/* Input Kunci Publik */}
          <div>
            <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-primary"><FiKey/> Your Public Key</h2>
            <textarea
              rows="6"
              className="w-full rounded-lg border border-border-color bg-dark-bg p-3 text-sm text-text-light focus:border-primary focus:ring-2 focus:ring-primary"
              value={inputPublicKey}
              onChange={(e) => setInputPublicKey(e.target.value)}
              placeholder="Paste the Public Key here to automatically start verification..."
            />
          </div>
          
          {/* Hasil Verifikasi */}
          <div className="mt-4 flex min-h-[6rem] items-center justify-center rounded-lg border-2 border-dashed border-border-color p-4">
            {isLoading && (
              <div className="flex items-center text-text-muted"><FiLoader className="mr-3 animate-spin" /> Verifying...</div>
            )}
            {!isLoading && verificationResult?.verify && (
               <div className="flex items-center text-green-400"><FiCheckCircle className="mr-3 h-6 w-6" /> Verification successful. File is downloading...</div>
            )}
             {!isLoading && verificationResult && !verificationResult.verify && (
               <div className="flex items-center text-red-400"><FiXCircle className="mr-3 h-6 w-6" /> Verification Failed.</div>
            )}
            {!isLoading && !verificationResult && (
               <div className="text-center text-text-muted">Waiting for Public Key...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}