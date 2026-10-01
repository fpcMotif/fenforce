import { useState } from 'react';
import { css } from '@linaria/core';
import { setupI18n } from '@lingui/core';
import { msg } from '@lingui/core/macro';

const i18n = setupI18n({ locale: 'en', messages: { en: {} } });
const buttonClass = css`
  color: rgb(12, 34, 56);
`;

export const Counter = () => {
  const [count, setCount] = useState(0);
  return (
    <button className={buttonClass} onClick={() => setCount(count + 1)}>
      {i18n._(msg`Count`)}: {count}
    </button>
  );
};
