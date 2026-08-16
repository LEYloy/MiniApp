// ============================================================
// Тарифы подписки "Скрыть себя" — общие для бота и для mini app.
// Поменяй под себя. Цены в Stars/USDT/TON — примерные (масштабированы
// от цены в рублях), подправь на реальный курс, если хочешь точнее.
// ============================================================
const HIDE_TARIFFS = [
    { id: "1m", days: 30, label: "1 месяц", priceRub: 149, priceStars: 1, priceUsdt: 1.5, priceTon: 1.1 },
    { id: "3m", days: 90, label: "3 месяца", priceRub: 299, priceStars: 299, priceUsdt: 3, priceTon: 2.2 },
    { id: "6m", days: 180, label: "6 месяцев", priceRub: 599, priceStars: 599, priceUsdt: 6, priceTon: 4.4 }
];

function getHideTariff(id) {
    return HIDE_TARIFFS.find((t) => t.id === id) || null;
}

module.exports = { HIDE_TARIFFS, getHideTariff };
