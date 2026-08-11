const fs = require('fs');
const path = require('path');

const file = path.join(
  __dirname,
  '..',
  'node_modules',
  '@codetrix-studio',
  'capacitor-google-auth',
  'android',
  'src',
  'main',
  'java',
  'com',
  'codetrixstudio',
  'capacitor',
  'GoogleAuth',
  'GoogleAuth.java',
);

if (!fs.existsSync(file)) process.exit(0);

const source = fs.readFileSync(file, 'utf8');

const patched = `      JSObject authentication = new JSObject();
      authentication.put("idToken", account.getIdToken());
      authentication.put(FIELD_ACCESS_TOKEN, "");
      authentication.put(FIELD_TOKEN_EXPIRES, 0);
      authentication.put(FIELD_TOKEN_EXPIRES_IN, 0);

      JSObject user = new JSObject();
      user.put("serverAuthCode", account.getServerAuthCode());
      user.put("idToken", account.getIdToken());
      user.put("authentication", authentication);

      user.put("name", account.getDisplayName());
      user.put("displayName", account.getDisplayName());
      user.put("email", account.getEmail());
      user.put("familyName", account.getFamilyName());
      user.put("givenName", account.getGivenName());
      user.put("id", account.getId());
      user.put("imageUrl", account.getPhotoUrl());

      call.resolve(user);`;

if (source.includes(patched)) process.exit(0);

const pattern = /      \/\/ The accessToken is retrieved by executing a network request against the Google API, so it needs to run in a thread\n      ExecutorService executor = Executors\.newSingleThreadExecutor\(\);\n      executor\.execute\(\(\) -> \{\n        try \{\n          JSONObject accessTokenObject = getAuthToken\(account\.getAccount\(\), true\);\n[\s\S]*?          call\.reject\("Something went wrong while retrieving access token", e\);\n        \}\n      \}\);/;

if (!pattern.test(source)) process.exit(0);

fs.writeFileSync(file, source.replace(pattern, patched));
