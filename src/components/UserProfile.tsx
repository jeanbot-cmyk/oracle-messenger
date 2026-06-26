import React, { useState } from 'react';

const UserProfile = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  const handleUpdate = () => {
    // Handle profile update logic
  };

  return (
    <div>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name"
      />
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
      />
      <button onClick={handleUpdate}>Update Profile</button>
    </div>
  );
};

export default UserProfile;
