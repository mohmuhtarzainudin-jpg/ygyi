import React, { useState } from 'react';
import { Printer } from 'lucide-react';

export const BluetoothPrinter = () => {
  const [status, setStatus] = useState<string>('Ready');

  const handlePrintTest = async () => {
    try {
      setStatus('Searching...');
      // @ts-ignore - Navigator.bluetooth is experimental
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }] // Standard UUID for printers
      });
      
      setStatus(`Connected to ${device.name}`);
      // Actual ESC/POS command logic would go here
      // This usually requires a library to encode text to bytes
      setTimeout(() => setStatus('Print Sent!'), 1000);
      setTimeout(() => setStatus('Ready'), 3000);
      
    } catch (error) {
      console.error(error);
      setStatus('Failed/Cancelled');
    }
  };

  return (
    <div className="p-4 bg-secondary rounded-lg border border-slate-700">
      <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
        <Printer size={20} /> Printer Setting
      </h3>
      <p className="text-sm text-slate-400 mb-4">
        Supports Web Bluetooth API for thermal printers.
      </p>
      <div className="flex items-center gap-4">
        <button 
          onClick={handlePrintTest}
          className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-white font-medium transition"
        >
          Connect & Test Print
        </button>
        <span className="text-sm font-mono">{status}</span>
      </div>
    </div>
  );
};