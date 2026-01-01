// Date utility functions for email formatting
// Supports Saudi Arabia timezone (Asia/Riyadh) and multiple locales

const formatDate = (date, options = {}, locale = 'en-US') => {
  if (!date) return 'N/A';

  try {
    const dateObj = new Date(date);

    // Default options for date formatting
    const defaultOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Asia/Riyadh', // Saudi Arabia timezone
      ...options
    };

    return dateObj.toLocaleDateString(locale, defaultOptions);
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'N/A';
  }
};

const formatDateTime = (date, options = {}, locale = 'en-US') => {
  if (!date) return 'N/A';

  try {
    const dateObj = new Date(date);

    // Default options for date-time formatting
    const defaultOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Riyadh', // Saudi Arabia timezone
      ...options
    };

    return dateObj.toLocaleString(locale, defaultOptions);
  } catch (error) {
    console.error('Error formatting date-time:', error);
    return 'N/A';
  }
};

module.exports = {
  formatDate,
  formatDateTime
};
