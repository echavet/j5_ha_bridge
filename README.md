# J5 Hassio Bridge pour Home Assistant

## Introduction

J5 Hassio Bridge est un add-on pour Home Assistant qui facilite l'interfaçage avec des capteurs connectés à une carte Arduino. Utilisant le firmware ConfigurableFirmata, il agit comme un pont entre Home Assistant et votre carte Arduino, permettant à Home Assistant d'interagir directement avec les capteurs de votre choix.

## Pré-requis

- Une installation fonctionnelle de Home Assistant.
- Une carte Arduino flashée avec le firmware ConfigurableFirmata. Attention, il peut être nécessaire de télécharger la branche principale de ConfigurableFirmata car elle intègre des corrections de bugs importants.
- Les capteurs que vous souhaitez utiliser, connectés à votre carte Arduino.

## Installation

1. Ouvrez Home Assistant et accédez au menu "Paramètres".
2. Sélectionnez "Modules complémentaires".
3. Appuyez sur le bouton Boutique des Modules Complémentaires.
4. Cliquer sur le bouton "..." en haut à droite.
5. Ajouter le dépot https://github.com/echavet/j5_ha_bridge 
6. De retour dans la liste des addons, vous devriez trouver j5_ha_bridge dans la section "Johnny-Five Home Assistant addon repository"

