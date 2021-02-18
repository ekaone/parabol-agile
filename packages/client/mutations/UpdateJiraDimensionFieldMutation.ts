import graphql from 'babel-plugin-relay/macro'
import {commitMutation} from 'react-relay'
import {SimpleMutation} from '../types/relayMutations'
import getJiraCloudIdAndKey from '../utils/getJiraCloudIdAndKey'
import createProxyRecord from '../utils/relay/createProxyRecord'
import {UpdateJiraDimensionFieldMutation as TUpdateJiraDimensionFieldMutation} from '../__generated__/UpdateJiraDimensionFieldMutation.graphql'
import {PokerMeeting_meeting} from '../__generated__/PokerMeeting_meeting.graphql'

graphql`
  fragment UpdateJiraDimensionFieldMutation_team on UpdateJiraDimensionFieldSuccess {
    meeting {
      phases {
        ... on EstimatePhase {
          stages {
            serviceField {
              name
              type
            }
          }
        }
      }
    }
    team {
      integrations {
        atlassian {
          jiraDimensionFields {
            cloudId
            projectKey
            dimensionId
            fieldName
          }
        }
      }
    }
  }
`

const mutation = graphql`
  mutation UpdateJiraDimensionFieldMutation(
    $dimensionId: ID!
    $fieldName: String!
    $meetingId: ID!
    $cloudId: ID!
    $projectKey: ID!
  ) {
    updateJiraDimensionField(
      dimensionId: $dimensionId
      fieldName: $fieldName
      meetingId: $meetingId
      cloudId: $cloudId
      projectKey: $projectKey
    ) {
      ... on ErrorPayload {
        error {
          message
        }
      }
      ...UpdateJiraDimensionFieldMutation_team @relay(mask: false)
    }
  }
`

const UpdateJiraDimensionFieldMutation: SimpleMutation<TUpdateJiraDimensionFieldMutation> = (
  atmosphere,
  variables
) => {
  return commitMutation<TUpdateJiraDimensionFieldMutation>(atmosphere, {
    mutation,
    variables,
    optimisticUpdater: (store) => {
      const {meetingId, cloudId, dimensionId, fieldName, projectKey} = variables
      const meeting = store.get<PokerMeeting_meeting>(meetingId)
      if (!meeting) return
      const teamId = meeting.getValue('teamId')
      // handle team record
      const atlassianTeamIntegration = store.get(`atlassianTeamIntegration:${teamId}`)
      if (atlassianTeamIntegration) {
        const jiraDimensionFields =
          atlassianTeamIntegration.getLinkedRecords('jiraDimensionFields') || []
        const existingField = jiraDimensionFields.find(
          (dimensionField) =>
            dimensionField.getValue('dimensionId') === dimensionId &&
            dimensionField.getValue('cloudId') === cloudId &&
            dimensionField.getValue('projectKey') === projectKey
        )
        if (existingField) {
          existingField.setValue(fieldName, 'fieldName')
        } else {
          const optimisticJiraDimensionField = createProxyRecord(store, 'JiraDimensionField', {
            fieldName,
            dimensionId,
            cloudId,
            projectKey
          })
          const nextJiraDimensionFields = [...jiraDimensionFields, optimisticJiraDimensionField]
          atlassianTeamIntegration.setLinkedRecords(nextJiraDimensionFields, 'jiraDimensionFields')
        }
      }
      // handle meeting records
      const phases = meeting.getLinkedRecords('phases')
      const estimatePhase = phases.find((phase) => phase.getValue('phaseType') === 'ESTIMATE')!
      const stages = estimatePhase.getLinkedRecords('stages')
      stages.forEach((stage) => {
        const serviceTaskId = stage.getValue('serviceTaskId') as string
        const [stageCloudId] = getJiraCloudIdAndKey(serviceTaskId)
        if (stage.getValue('dimensionId') === dimensionId && stageCloudId === cloudId) {
          // the type being a number is just a guess
          const nextServiceField = createProxyRecord(store, 'ServiceField', {
            name: fieldName,
            type: 'number'
          })
          stage.setLinkedRecord(nextServiceField, 'serviceField')
        }
      })
    }
  })
}

export default UpdateJiraDimensionFieldMutation
