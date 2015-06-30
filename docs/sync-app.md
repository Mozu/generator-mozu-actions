# Creating a Sync App

The tools for uploading and syncing Mozu Actions require a Mozu Application to "run under". Even if you are working on a Mozu Application, your tools will sync it under the credentials of a different one, which you can call your *sync app*. Your sync app belongs to you as a developer; you can have one sync app per environment, and configure it permanently for all local apps you work on.

## Steps

###Create your Sync App as you would any application, by navigating to Applications in Developer Center and creating a new one.

![create-app-1](https://cloud.githubusercontent.com/assets/1643758/8441021/750000c6-1f3b-11e5-830f-216dd2328d31.png)


###Click "Create New Application".

![create-app-2](https://cloud.githubusercontent.com/assets/1643758/8441024/75027932-1f3b-11e5-8143-61ef02dbfd65.png)


###Give your application a short, memorable name and ID that have something to do with "sync" and your identity.

![create-app-3](https://cloud.githubusercontent.com/assets/1643758/8441025/7502b2f8-1f3b-11e5-868e-2c8df4261085.png)


###The application will appear in your applications list. Click the gear icon in the right of the row and click "Edit".

![create-app-4](https://cloud.githubusercontent.com/assets/1643758/8441023/75023d32-1f3b-11e5-998e-e03c9824d804.png)


###In the application editor, click the left tab labeled "Packages".

![create-app-5](https://cloud.githubusercontent.com/assets/1643758/8441022/7501f958-1f3b-11e5-97ac-69b57f1d6f35.png)


###Navigate to the subsection "Behaviors".

![create-app-6](https://cloud.githubusercontent.com/assets/1643758/8441026/75038e08-1f3b-11e5-8e91-4e10cafedd2b.png)


###Click "Select Behaviors" to begin adding the required behaviors to your app. (Behaviors are permissions.)

![create-app-7](https://cloud.githubusercontent.com/assets/1643758/8441029/750f597c-1f3b-11e5-8c31-717795465d4c.png)


###In the leftmost panel, select "Developer". Check the checkbox for the "Developer Read" permission.

![create-app-8](https://cloud.githubusercontent.com/assets/1643758/8441030/75107d5c-1f3b-11e5-8338-0611f6b4cf52.png)


###Do the same for the "Developer Asset" permissions.

![create-app-9](https://cloud.githubusercontent.com/assets/1643758/8441027/750e99ec-1f3b-11e5-97f6-11691614699b.png)


###Click "Save". Your Behaviors subsection should now list the allowed behaviors.

![create-app-10](https://cloud.githubusercontent.com/assets/1643758/8441028/750eb814-1f3b-11e5-99b5-ccc79b856748.png)


###Your Sync app is now configured to allow sync. Note the Application Key and Shared Secret (click "Show" to reveal the Shared Secret).

![create-app-11](https://cloud.githubusercontent.com/assets/1643758/8441031/7514022e-1f3b-11e5-9253-051a83d66222.png)
