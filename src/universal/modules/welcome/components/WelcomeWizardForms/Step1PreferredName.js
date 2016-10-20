import React, {Component, PropTypes} from 'react';
import {Field, reduxForm, initialize} from 'redux-form';
import InputField from 'universal/components/InputField/InputField';
import WelcomeHeading from '../WelcomeHeading/WelcomeHeading';
import {cashay} from 'cashay';
import {nextPage, updateCompleted} from 'universal/modules/welcome/ducks/welcomeDuck';

const reduxFormOptions = {
  form: 'welcomeWizard',
  destroyOnUnmount: false
  // TODO: add validations
};

@reduxForm(reduxFormOptions)
export default class Step1PreferredName extends Component {
  static propTypes = {
    dispatch: PropTypes.func.isRequired,
    handleSubmit: PropTypes.func,
    preferredName: PropTypes.string,
    onSubmit: PropTypes.func,
    user: PropTypes.object,
    completed: PropTypes.number
  };

  componentWillMount() {
    const {dispatch, user: {preferredName}} = this.props;
    return dispatch(initialize('welcomeWizard', {preferredName}));
  }

  onPreferredNameSubmit = (submissionData) => {
    const {dispatch, user} = this.props;
    const {preferredName: newPrefferedName} = submissionData;
    const options = {
      variables: {
        updatedUser: {
          id: user.id,
          preferredName: newPrefferedName
        }
      }
    };
    cashay.mutate('updateUserProfile', options);
    dispatch(updateCompleted(1));
    dispatch(nextPage());
  };

  render() {
    const {handleSubmit, preferredName} = this.props;
    return (
      <div>{/* Div for that flexy flex */}
        <WelcomeHeading copy={<span>Please type in your name:</span>}/>
        <form onSubmit={handleSubmit(this.onPreferredNameSubmit)}>
          <Field
            autoFocus
            buttonDisabled={!preferredName}
            buttonIcon="check-circle"
            component={InputField}
            hasButton
            hasShortcutHint
            isLarger
            name="preferredName"
            placeholder="Albert Einstein"
            shortcutHint="Press enter"
            type="text"
          />
        </form>
      </div>
    );
  }
}
