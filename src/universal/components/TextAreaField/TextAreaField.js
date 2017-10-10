import PropTypes from 'prop-types';
import React from 'react';
import withStyles from 'universal/styles/withStyles';
import {css} from 'aphrodite-local-styles/no-important';
import ui from 'universal/styles/ui';
import makeFieldColorPalette from 'universal/styles/helpers/makeFieldColorPalette';
// import Textarea from 'react-textarea-autosize';
import FieldBlock from 'universal/components/FieldBlock/FieldBlock';
import FieldHelpText from 'universal/components/FieldHelpText/FieldHelpText';
import FieldLabel from 'universal/components/FieldLabel/FieldLabel';

const TextAreaField = (props) => {
  const {
    autoFocus,
    disabled,
    input,
    label,
    meta: {touched, error},
    placeholder,
    readOnly,
    styles
  } = props;

  const inputStyles = css(
    styles.field,
    disabled && styles.disabled,
    readOnly && styles.readOnly,
  );

  return (
    <FieldBlock>
      {label && <FieldLabel label={label} htmlFor={input.name} />}
      <div className={css(styles.inputBlock)}>
        <textarea
          {...input}
          autoFocus={autoFocus}
          className={inputStyles}
          defaultValue={input.value}
          disabled={disabled || readOnly}
          placeholder={placeholder}
          value={undefined}
        />
      </div>
      {touched && error && <FieldHelpText hasErrorText helpText={error} />}
    </FieldBlock>
  );
};

TextAreaField.propTypes = {
  autoFocus: PropTypes.bool,
  disabled: PropTypes.bool,
  fieldSize: PropTypes.oneOf(ui.fieldSizes),
  hasErrorText: PropTypes.bool,
  input: PropTypes.shape({
    name: PropTypes.string,
    onBlur: PropTypes.func,
    onChange: PropTypes.func,
    onFocus: PropTypes.func,
    type: PropTypes.string,
    value: PropTypes.string
  }),
  label: PropTypes.string,
  meta: PropTypes.object.isRequired,
  placeholder: PropTypes.string,
  readOnly: PropTypes.bool,
  styles: PropTypes.object
};

const styleThunk = (theme, {fieldSize}) => {
  const size = fieldSize || ui.fieldSizes[1];
  return ({
    field: {
      ...ui.fieldBaseStyles,
      ...ui.fieldSizeStyles[size],
      ...makeFieldColorPalette('gray'),
      minHeight: '5.75rem'
    },
    disabled: ui.fieldDisabled,
    readOnly: ui.fieldReadOnly
  });
};

export default withStyles(styleThunk)(TextAreaField);
