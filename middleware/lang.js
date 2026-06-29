
const translations = require('../locales/translations');

module.exports = (req, res, next) => {
  if (req.query.lang && (req.query.lang === 'id' || req.query.lang === 'en')) {
    req.session.lang = req.query.lang;
  }
  let lang = req.session && req.session.lang;
  if (!lang) {
    const acceptLang = req.headers['accept-language'] || '';
    lang = acceptLang.toLowerCase().startsWith('en') ? 'en' : 'id';
  }
  lang = lang === 'en' ? 'en' : 'id';
  res.locals.lang = lang;
  res.locals.t = translations[lang];
  next();
};
