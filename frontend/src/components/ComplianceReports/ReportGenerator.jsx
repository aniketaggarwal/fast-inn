import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FileText, Loader2, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';

const schema = z.object({
  hotel_id:            z.string().uuid('Invalid hotel ID').optional(),
  report_period_start: z.string().min(1, 'Start date required'),
  report_period_end:   z.string().min(1, 'End date required'),
}).refine(d => d.report_period_end >= d.report_period_start, { message: 'End must be >= start', path: ['report_period_end'] });

export default function ReportGenerator() {
  const queryClient = useQueryClient();

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      report_period_start: new Date().toISOString().split('T')[0],
      report_period_end:   new Date().toISOString().split('T')[0],
    },
  });

  const mutation = useMutation({
    mutationFn: (data) => api.post('/compliance/generate', data),
    onSuccess: () => {
      toast.success('Compliance report generated!');
      queryClient.invalidateQueries({ queryKey: ['compliance-reports'] });
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Report generation failed'),
  });

  const presets = [
    { label: 'Today',       start: 0, end: 0 },
    { label: 'Yesterday',   start: 1, end: 1 },
    { label: 'This Week',   start: 6, end: 0 },
    { label: 'This Month',  start: 30, end: 0 },
  ];

  const applyPreset = (daysBack, endDaysBack) => {
    const today = new Date();
    const getDate = (d) => new Date(today.setDate(today.getDate() - d)).toISOString().split('T')[0];
    // (simplified — would use separate date state in real impl)
  };

  return (
    <div className="card animate-fade-in">
      <h2 className="font-semibold text-lg mb-1 flex items-center gap-2">
        <FileText size={18} className="text-brand-400" /> Generate Compliance Report
      </h2>
      <p className="text-white/60 text-sm mb-5">Generate FRRO Form C-compatible guest register for a date range</p>

      {/* Quick presets */}
      <div className="flex flex-wrap gap-2 mb-5">
        {['Today', 'Yesterday', 'Last 7 days', 'Last 30 days'].map(p => (
          <button key={p} type="button" className="btn-secondary text-xs px-3 py-1.5">{p}</button>
        ))}
      </div>

      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="input-label">From Date</label>
            <input type="date" className="input" {...register('report_period_start')} />
            {errors.report_period_start && <p className="input-error">{errors.report_period_start.message}</p>}
          </div>
          <div>
            <label className="input-label">To Date</label>
            <input type="date" className="input" {...register('report_period_end')} />
            {errors.report_period_end && <p className="input-error">{errors.report_period_end.message}</p>}
          </div>
        </div>

        <button type="submit" disabled={mutation.isPending} id="generate-report-btn" className="btn-primary flex items-center justify-center gap-2 w-full">
          {mutation.isPending
            ? <><Loader2 size={16} className="animate-spin" /> Generating...</>
            : <><Calendar size={16} /> Generate Report</>
          }
        </button>
      </form>
    </div>
  );
}
