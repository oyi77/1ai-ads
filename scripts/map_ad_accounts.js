import Database from 'better-sqlite3';

const db = new Database('./db/adforge.db');

// Ad Account IDs dari Bro
const adAccountIds = [
  '1601373334527521',
  '1204208138534580',
  '1181078009580337',
  '380721031313330',
  '1773760133153789',
  '1439536310038458',
  '2125021885010866'
];

console.log('=== SAVE AD ACCOUNTS ===\n');

adAccountIds.forEach((acctId, idx) => {
  const accountId = 'act_' + acctId;
  
  // Get first user ID
  const users = db.prepare('SELECT id FROM users LIMIT 1').all();
  const userId = users[0]?.id;
  
  // Insert new platform account  
  const accountIdKey = 'meta-act-' + acctId;
  db.prepare(`
    INSERT OR REPLACE INTO platform_accounts (id, user_id, platform, account_name, credentials, is_active, health_status, created_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP)
  `).run(
    accountIdKey,
    userId,
    'meta',
    'Ad Account - ' + accountId,
    '{}',
    'connected'
  );
  
  console.log(idx + 1 + '. Inserted:', accountId, '->', accountIdKey);
});

console.log('\n=== CURRENT AD ACCOUNTS ===');
const accounts2 = db.prepare('SELECT id, platform, account_name FROM platform_accounts WHERE platform = ?').bind(['meta']).all();
accounts2.forEach(a => console.log('ID:', a.id, '| Name:', a.account_name));

console.log('\n=== MAP AD ACCOUNT -> BM ===');
const adAccountMap = {
  'act_1601373334527521': 'BM - 1611764243355432',
  'act_1204208138534580': 'BM - 1014429891756026',
  'act_1181078009580337': 'BM - 1439662244297156',
  'act_380721031313330': 'BM - Herbalisme Pusat (997737406765722)',
  'act_1773760133153789': 'BM - 1525611115871836',
  'act_1439536310038458': 'BM - 984753780897247',
  'act_2125021885010866': 'BM - 1439662244297156'
};

console.log('\n=== AD ACCOUNT TO BM MAPPING ===');
Object.entries(adAccountMap).forEach(([acct, bm]) => {
  console.log('  ', acct, '->', bm);
});

console.log('\n✅ Ad Accounts saved to database!');

db.close();
