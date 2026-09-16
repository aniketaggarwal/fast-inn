import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle, Clock, XCircle, FileImage, AlertCircle, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import api from '../../services/api';

const STATUS_CONFIG = {
  verified: {
    icon: CheckCircle, color: 'emerald',
    badge: 'badge-verified', title: 'Verified',
    desc: 'Your identity has been verified. You can check in to hotels seamlessly.',
  },
  pending: {
    icon: Clock, color: 'brand',
    badge: 'badge-info', title: 'Under Review',
    desc: 'Our team is reviewing your documents. Usually takes 2–4 hours.',
  },
  rejected: {
    icon: XCircle, color: 'red',
    badge: 'badge-rejected', title: 'Rejected',
    desc: 'Your KYC was not approved. Please re-upload a clear document.',
  },
};

export default function VerificationStatus() {
  const { data: kyc, isLoading, refetch } = useQuery({
    queryKey: ['kyc-status'],
    queryFn:  () => api.get('/guests/kyc/status').then(r => r.data.data),
    refetchInterval: (data) => data?.verification_status === 'pending' ? 30000 : false,
  });

  if (isLoading) {
    return (
      <div className="card animate-pulse">
        <div className="h-5 bg-white/10 rounded w-32 mb-3" />
        <div className="h-4 bg-white/10 rounded w-full mb-2" />
        <div className="h-4 bg-white/10 rounded w-2/3" />
      </div>
    );
  }

  if (!kyc) return null;

  const config = STATUS_CONFIG[kyc.verification_status] || STATUS_CONFIG.pending;
  const Icon = config.icon;

  const colorBg = { emerald: 'bg-emerald-500/10 border-emerald-500/20', brand: 'bg-brand-500/10 border-brand-500/20', red: 'bg-red-500/10 border-red-500/20' };
  const colorText = { emerald: 'text-emerald-400', brand: 'text-brand-400', red: 'text-red-400' };

  return (
    <div className={`card border ${colorBg[config.color]} animate-fade-in`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <Icon size={20} className={`${colorText[config.color]} flex-shrink-0 mt-0.5`} />
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`badge ${config.badge}`}>{config.title}</span>
              <span className="text-white/40 text-xs">
                {kyc.created_at ? `Submitted ${formatDistanceToNow(new Date(kyc.created_at), { addSuffix: true })}` : ''}
              </span>
            </div>
            <p className="text-white/70 text-sm">{config.desc}</p>
            {kyc.rejection_reason && (
              <div className="mt-2 p-2 bg-red-500/10 rounded-lg text-xs text-red-400">
                <strong>Reason:</strong> {kyc.rejection_reason}
              </div>
            )}
          </div>
        </div>
        {kyc.verification_status === 'pending' && (
          <button onClick={() => refetch()} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/40 hover:text-white" title="Refresh">
            <RefreshCw size={14} />
          </button>
        )}
      </div>

      {/* KYC details */}
      {kyc.verification_status !== 'pending' && (
        <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-white/40 text-xs">Document Type</p>
            <p className="font-medium capitalize">{kyc.id_type?.replace('_', ' ')}</p>
          </div>
          {kyc.extracted_name && (
            <div>
              <p className="text-white/40 text-xs">Extracted Name</p>
              <p className="font-medium">{kyc.extracted_name}</p>
            </div>
          )}
          {kyc.ocr_confidence_score !== null && (
            <div>
              <p className="text-white/40 text-xs">OCR Confidence</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-white/10 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full ${kyc.ocr_confidence_score > 0.7 ? 'bg-emerald-500' : kyc.ocr_confidence_score > 0.4 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${(kyc.ocr_confidence_score * 100)}%` }}
                  />
                </div>
                <span className="text-xs text-white/60">{Math.round(kyc.ocr_confidence_score * 100)}%</span>
              </div>
            </div>
          )}
          {kyc.verified_at && (
            <div>
              <p className="text-white/40 text-xs">Verified</p>
              <p className="font-medium text-xs">{formatDistanceToNow(new Date(kyc.verified_at), { addSuffix: true })}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
