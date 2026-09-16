'use strict';
/**
 * logger.js — Winston logger with console + rotating file transports
 */
const { createLogger, format, transports } = require('winston');
require('winston-daily-rotate-file');
const config = require('../config/env');

const { combine, timestamp, colorize, printf, json, errors } = format;

const consoleFormat = printf(({ level, message, timestamp: ts, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `[${ts}] ${level}: ${message}${metaStr}`;
});

const fileTransport = new transports.DailyRotateFile({
  dirname:       'logs',
  filename:      'hotelverify-%DATE%.log',
  datePattern:   'YYYY-MM-DD',
  maxFiles:      '14d',
  maxSize:       '20m',
  zippedArchive: true,
  format:        combine(timestamp(), errors({ stack: true }), json()),
});

const logger = createLogger({
  level: config.NODE_ENV === 'production' ? 'info' : 'debug',
  exitOnError: false,
  transports: [
    new transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: 'HH:mm:ss' }),
        consoleFormat
      ),
    }),
    fileTransport,
  ],
});

module.exports = logger;
