/**
 * Utility functions for date formatting throughout the application
 * Provides consistent date display formats
 */

/**
 * Format a date string or Date object to a human-readable format
 * @param date - Date to format (string or Date object)
 * @param options - Formatting options
 * @returns Formatted date string
 */
export function formatDate(date: string | Date, options: {
  includeWeekday?: boolean,
  includeYear?: boolean,
  includeTime?: boolean,
  shortMonth?: boolean
} = {}) {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  // Default options
  const defaultOptions = {
    includeWeekday: true,
    includeYear: true,
    includeTime: false,
    shortMonth: false
  };
  
  // Merge options with defaults
  const finalOptions = { ...defaultOptions, ...options };
  
  // Build format options for toLocaleDateString
  const formatOptions: Intl.DateTimeFormatOptions = {
    month: finalOptions.shortMonth ? 'short' : 'long',
    day: 'numeric'
  };
  
  if (finalOptions.includeWeekday) {
    formatOptions.weekday = 'long';
  }
  
  if (finalOptions.includeYear) {
    formatOptions.year = 'numeric';
  }
  
  let formatted = dateObj.toLocaleDateString('en-US', formatOptions);
  
  if (finalOptions.includeTime) {
    formatted += ' at ' + dateObj.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  return formatted;
}

/**
 * Format a date range as a string
 * @param startDate - Start date
 * @param endDate - End date
 * @returns Formatted date range string
 */
export function formatDateRange(startDate: string | Date, endDate: string | Date) {
  // For date ranges, use shorter format for start date
  const start = formatDate(startDate, {
    includeWeekday: true,
    includeYear: false,
    shortMonth: true
  });
  
  // For end date, include the year
  const end = formatDate(endDate, {
    includeWeekday: true,
    includeYear: true,
    shortMonth: true
  });
  
  return `${start} to ${end}`;
}

/**
 * Get formatted today's date
 */
export function getTodayFormatted() {
  return formatDate(new Date());
}

/**
 * Format date for input fields (YYYY-MM-DD)
 * @param date - Date to format
 * @returns Date string in YYYY-MM-DD format
 */
export function formatDateForInput(date: Date = new Date()) {
  return date.toISOString().split('T')[0];
}

/**
 * Get a date N days from today
 * @param daysFromToday - Number of days from today (positive for future, negative for past)
 * @returns Date object N days from today
 */
export function getDateFromToday(daysFromToday: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return date;
}
