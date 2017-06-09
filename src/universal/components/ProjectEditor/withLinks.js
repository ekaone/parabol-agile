import {EditorState, KeyBindingUtil} from 'draft-js';
import PropTypes from 'prop-types';
import React, {Component} from 'react';
import EditorLinkChanger from 'universal/components/EditorLinkChanger/EditorLinkChanger';
import EditorLinkViewer from 'universal/components/EditorLinkViewer/EditorLinkViewer';
import getAnchorLocation from 'universal/components/ProjectEditor/getAnchorLocation';
import getSelectionLink from 'universal/components/ProjectEditor/getSelectionLink';
import getSelectionText from 'universal/components/ProjectEditor/getSelectionText';
import getWordAt from 'universal/components/ProjectEditor/getWordAt';
import addSpace from 'universal/components/ProjectEditor/operations/addSpace';
import makeAddLink from 'universal/components/ProjectEditor/operations/makeAddLink';
import splitBlock from 'universal/components/ProjectEditor/operations/splitBlock';
import getDraftCoords from 'universal/utils/getDraftCoords';
import linkify from 'universal/utils/linkify';

const getCtrlKSelection = (editorState) => {
  const selection = editorState.getSelection();
  if (selection.isCollapsed()) {
    const {block, anchorOffset} = getAnchorLocation(editorState);
    const blockText = block.getText();
    const {word, begin, end} = getWordAt(blockText, anchorOffset - 1);

    if (word) {
      return selection.merge({
        anchorOffset: begin,
        focusOffset: end
      });
    }
  }
  return selection;
};

const {hasCommandModifier} = KeyBindingUtil;

const withLinks = (ComposedComponent) => {
  return class WithLinks extends Component {
    static propTypes = {
      removeModal: PropTypes.func,
      renderModal: PropTypes.func,
      handleBeforeInput: PropTypes.func,
      handleChange: PropTypes.func,
      handleKeyCommand: PropTypes.func,
      keyBindingFn: PropTypes.func
    };
    state = {};

    // LinkChanger can take focus, so sometimes we don't want to blur
    removeModal = (allowFocus) => {
      const {linkChangerData} = this.state;
      if (!linkChangerData || allowFocus) {
        this.setState({
          linkViewerData: undefined,
          linkChangerData: undefined
        });
      }
    };

    getMaybeLinkifiedState = (getNextState, editorState) => {
      this.undoLink = undefined;
      const {block, anchorOffset} = getAnchorLocation(editorState);
      const blockText = block.getText();
      // -1 to remove the link from the current caret state
      const {begin, end, word} = getWordAt(blockText, anchorOffset - 1, true);
      if (!word) return undefined;
      const entityKey = block.getEntityAt(anchorOffset - 1);

      if (entityKey) {
        const contentState = editorState.getCurrentContent();
        const entity = contentState.getEntity(entityKey);
        if (entity.getType() === 'LINK') {
          // the character that is to the left of the caret is a link
          //  const {begin, end, word} = getWordAt(blockText, anchorOffset, true);
          const entityKeyToRight = block.getEntityAt(anchorOffset);
          // if they're putting a space within the link, keep it contiguous
          if (entityKey !== entityKeyToRight) {
            // hitting space should close the modal
            if (this.props.renderModal) {
              this.props.removeModal();
            } else {
              const {linkViewerData, linkChangerData} = this.state;
              if (linkViewerData || linkChangerData) {
                this.removeModal();
              }
            }
            return getNextState();
          }
        }
      } else {
        const links = linkify.match(word);
        // make sure the link starts at the beginning of the word otherwise we get conflicts with markdown and junk
        if (links && links[0].index === 0) {
          const {url} = links[0];
          const linkifier = makeAddLink(block.getKey(), begin, end, url);
          this.undoLink = true;
          // getNextState is a thunk because 99% of the time, we won't ever use it,
          return linkifier(getNextState());
        }
      }
      return undefined;
    };

    handleBeforeInput = (char, editorState, setEditorState) => {
      const {handleBeforeInput} = this.props;
      if (handleBeforeInput) {
        const result = handleBeforeInput(char, editorState, setEditorState);
        if (result === 'handled' || result === true) {
          return result;
        }
      }
      if (char === ' ') {
        const getNextState = () => addSpace(editorState);
        const updatedEditorState = this.getMaybeLinkifiedState(getNextState, editorState);
        if (updatedEditorState) {
          setEditorState(updatedEditorState);
          return 'handled';
        }

        return undefined;
      }
    };

    handleChange = (editorState, setEditorState) => {
      const {handleChange} = this.props;
      const {linkChangerData, linkViewerData} = this.state;
      if (handleChange) {
        handleChange(editorState, setEditorState);
      }
      this.undoLink = undefined;
      const {block, anchorOffset} = getAnchorLocation(editorState);
      const entityKey = block.getEntityAt(anchorOffset - 1);
      if (entityKey && !linkChangerData) {
        const contentState = editorState.getCurrentContent();
        const entity = contentState.getEntity(entityKey);
        if (entity.getType() === 'LINK') {
          this.setState({
            linkViewerData: entity.getData()
          });
          return;
        }
      }
      if (linkViewerData) {
        this.removeModal();
      }
    };

    handleKeyCommand = (command, editorState, setEditorState) => {
      const {handleKeyCommand} = this.props;
      if (handleKeyCommand) {
        const result = handleKeyCommand(command, editorState, setEditorState);
        if (result === 'handled' || result === true) {
          return result;
        }
      }

      if (command === 'split-block') {
        const getNextState = () => splitBlock(editorState);
        const updatedEditorState = this.getMaybeLinkifiedState(getNextState, editorState);
        if (updatedEditorState) {
          setEditorState(updatedEditorState);
          return 'handled';
        }
      }

      if (command === 'backspace' && this.undoLink) {
        setEditorState(EditorState.undo(editorState));
        this.undoLink = undefined;
        return 'handled';
      }

      if (command === 'add-hyperlink') {
        this.addHyperlink(editorState);
        return 'handled';
      }
      return 'not-handled';
    };

    initialize = () => {
      const {linkViewerData, linkChangerData} = this.state;
      if (linkViewerData || linkChangerData) {
        const targetRect = getDraftCoords();
        if (targetRect) {
          this.left = targetRect.left;
          this.top = targetRect.top + 32;
        }
        const renderModal = linkViewerData ? this.renderViewerModal : this.renderChangerModal;
        const {removeModal} = this;
        return {
          renderModal,
          removeModal
        };
      }
      return {};
    };

    keyBindingFn = (e) => {
      const {keyBindingFn} = this.props;
      if (keyBindingFn) {
        const result = keyBindingFn(e);
        if (result) {
          return result;
        }
      }
      if (e.key === 'k' && hasCommandModifier(e)) {
        return 'add-hyperlink';
      }
      return undefined;
    };

    renderChangerModal = ({editorState, setEditorState, editorRef}) => {
      const {linkChangerData} = this.state;
      const {text, link} = linkChangerData;
      return (
        <EditorLinkChanger
          isOpen
          top={this.top}
          left={this.left}
          editorState={editorState}
          setEditorState={setEditorState}
          removeModal={this.removeModal}
          linkData={linkChangerData}
          initialValues={{text, link}}
          editorRef={editorRef}
        />
      );
    };

    renderViewerModal = ({editorState, setEditorState}) => {
      const {linkViewerData} = this.state;
      const targetRect = getDraftCoords();
      if (!targetRect) {
        console.log('no target rect!');
      }
      return (
        <EditorLinkViewer
          isOpen
          top={targetRect && targetRect.top + 32}
          left={targetRect && targetRect.left}
          editorState={editorState}
          setEditorState={setEditorState}
          removeModal={this.removeModal}
          linkData={linkViewerData}
          addHyperlink={this.addHyperlink}
        />
      );
    };

    addHyperlink = (editorState) => {
      const selectionState = getCtrlKSelection(editorState);
      const text = getSelectionText(editorState, selectionState);
      const link = getSelectionLink(editorState, selectionState);
      this.setState({
        linkViewerData: undefined,
        linkChangerData: {
          link,
          text
        }
      });
    };

    render() {
      const modalProps = this.initialize();
      return (<ComposedComponent
        {...this.props}
        {...modalProps}
        handleBeforeInput={this.handleBeforeInput}
        handleChange={this.handleChange}
        handleKeyCommand={this.handleKeyCommand}
        keyBindingFn={this.keyBindingFn}
      />);
    }
  }
};

export default withLinks;
