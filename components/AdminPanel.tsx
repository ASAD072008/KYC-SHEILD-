import React, { useEffect, useState } from 'react';
import { db } from '../services/firebase';
import { collection, getDocs, query, orderBy, Timestamp } from 'firebase/firestore';

interface ScanData {
  id: string;
  userId: string;
  timestamp: Timestamp;
  isReal: boolean;
  confidence: number;
  message: string;
  issues: string[];
  location?: { lat: number, lng: number };
  deviceInfo?: {
    platform: string;
    browserName: string;
    browserVersion: string;
    screenResolution: string;
    language: string;
    timezone: string;
    userAgent: string;
    vendor: string;
    cookiesEnabled: boolean;
    doNotTrack: string | null;
    online: boolean;
  };
}

export const AdminPanel: React.FC = () => {
  const [scans, setScans] = useState<ScanData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchScans = async () => {
      if (!db) return;
      try {
        const q = query(collection(db, 'scans'), orderBy('timestamp', 'desc'));
        const querySnapshot = await getDocs(q);
        const fetchedScans: ScanData[] = [];
        querySnapshot.forEach((doc) => {
          fetchedScans.push({ id: doc.id, ...doc.data() } as ScanData);
        });
        setScans(fetchedScans);
      } catch (error) {
        console.error("Error fetching scans:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchScans();
  }, []);

  if (loading) {
    return <div className="min-h-screen pt-24 flex justify-center text-white">Loading Admin Data...</div>;
  }

  return (
    <div className="min-h-screen pt-24 px-4 md:px-8 bg-void text-white">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-blue-400">Admin Review Panel</h1>
        
        <div className="bg-gray-900/50 rounded-xl border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                  <th className="p-4">Time</th>
                  <th className="p-4">User ID</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Confidence</th>
                  <th className="p-4">Device / Location</th>
                  <th className="p-4">Issues</th>
                  <th className="p-4">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {scans.map((scan) => (
                  <tr key={scan.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="p-4 text-sm text-slate-400 font-mono">
                      {scan.timestamp?.toDate().toLocaleString()}
                    </td>
                    <td className="p-4 text-sm font-mono text-blue-400">
                      {scan.userId.substring(0, 8)}...
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide border ${
                        scan.isReal 
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                      }`}>
                        {scan.isReal ? 'VERIFIED' : 'REJECTED'}
                      </span>
                    </td>
                    <td className="p-4 text-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-20 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${scan.confidence > 80 ? 'bg-emerald-500' : scan.confidence > 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                            style={{ width: `${scan.confidence}%` }}
                          />
                        </div>
                        <span className={`font-mono font-bold ${scan.confidence > 80 ? 'text-emerald-400' : 'text-slate-500'}`}>{scan.confidence}%</span>
                      </div>
                    </td>
                    <td className="p-4 text-xs text-slate-400">
                      {scan.deviceInfo ? (
                        <div className="flex flex-col gap-1">
                           <div className="flex items-center gap-2 flex-wrap">
                               <span className="text-slate-300 font-bold">{scan.deviceInfo.browserName || 'Unknown'} {scan.deviceInfo.browserVersion}</span>
                               <span className="px-1.5 py-0.5 bg-slate-800 rounded text-[10px] text-slate-500 border border-slate-700 uppercase">{scan.deviceInfo.platform}</span>
                           </div>
                           <div className="text-[10px] text-slate-500 flex gap-2 items-center">
                               <span>{scan.deviceInfo.screenResolution}</span>
                               <span>•</span>
                               <span>{scan.deviceInfo.language}</span>
                               <span>•</span>
                               <span title={scan.deviceInfo.timezone}>{scan.deviceInfo.timezone.split('/')[1] || scan.deviceInfo.timezone}</span>
                           </div>
                           {scan.location && (
                             <a 
                               href={`https://www.google.com/maps?q=${scan.location.lat},${scan.location.lng}`} 
                               target="_blank" 
                               rel="noreferrer"
                               className="text-blue-400 hover:underline flex items-center gap-1 mt-1"
                             >
                               <i className="fa-solid fa-location-dot"></i> 
                               {scan.location.lat.toFixed(4)}, {scan.location.lng.toFixed(4)}
                             </a>
                           )}
                        </div>
                      ) : (
                        <span className="text-slate-600 italic">N/A</span>
                      )}
                    </td>
                    <td className="p-4 text-sm text-slate-400">
                      {scan.issues && scan.issues.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {scan.issues.map((issue, idx) => (
                            <span key={idx} className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded text-[10px] border border-slate-700">
                              {issue}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-600 text-xs italic">No Issues</span>
                      )}
                    </td>
                    <td className="p-4 text-sm text-slate-300 max-w-xs truncate">
                      {scan.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {scans.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              No verification records found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
